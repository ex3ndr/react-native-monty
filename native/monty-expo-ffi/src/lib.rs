use std::{
    collections::HashMap,
    ffi::{c_char, CStr, CString},
    str::FromStr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
};

use monty::{
    ExcType, ExtFunctionResult, MontyException, MontyObject, MontyRun, NameLookupResult,
    NoLimitTracker, PrintWriter, RunProgress,
};
use num_bigint::BigInt;
use serde::Deserialize;
use serde_json::{json, Map, Number, Value as JsonValue};

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct RunOptionsInput {
    inputs: Option<Map<String, JsonValue>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct MontyOptionsInput {
    #[serde(rename = "scriptName")]
    script_name: Option<String>,
    inputs: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ResumeOptionsInput {
    #[serde(rename = "returnValue")]
    return_value: Option<JsonValue>,
    exception: Option<ExceptionInput>,
    value: Option<JsonValue>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ExceptionInput {
    #[serde(rename = "type", alias = "typeName")]
    exception_type: Option<String>,
    message: Option<String>,
}

#[derive(Debug)]
enum SnapshotState {
    FunctionCall(monty::FunctionCall<NoLimitTracker>),
    NameLookup(monty::NameLookup<NoLimitTracker>),
}

#[derive(Debug)]
struct StoredSnapshot {
    script_name: String,
    state: SnapshotState,
}

static SNAPSHOT_STORE: OnceLock<Mutex<HashMap<String, StoredSnapshot>>> = OnceLock::new();
static NEXT_SNAPSHOT_ID: AtomicU64 = AtomicU64::new(1);

fn c_char_ptr_to_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let c_str = unsafe { CStr::from_ptr(ptr) };
    Some(c_str.to_string_lossy().into_owned())
}

fn parse_json_or_default<T: for<'de> Deserialize<'de> + Default>(raw: Option<String>) -> T {
    raw.and_then(|text| serde_json::from_str::<T>(&text).ok())
        .unwrap_or_default()
}

fn error_json(type_name: &str, message: impl Into<String>) -> JsonValue {
    json!({
        "ok": false,
        "error": {
            "typeName": type_name,
            "message": message.into(),
            "traceback": []
        }
    })
}

fn parse_tagged_object(values: &Map<String, JsonValue>) -> Option<Result<MontyObject, String>> {
    if let Some(value) = values.get("$ellipsis") {
        if values.len() != 1 {
            return Some(Err(
                "$ellipsis payload must not include extra keys".to_owned()
            ));
        }
        return Some(match value {
            JsonValue::Bool(true) => Ok(MontyObject::Ellipsis),
            _ => Err("$ellipsis must be true".to_owned()),
        });
    }

    if let Some(value) = values.get("$bigint") {
        if values.len() != 1 {
            return Some(Err("$bigint payload must not include extra keys".to_owned()));
        }
        return Some(match value {
            JsonValue::String(text) => BigInt::from_str(text)
                .map(MontyObject::BigInt)
                .map_err(|_| "invalid $bigint string".to_owned()),
            _ => Err("$bigint must be a string".to_owned()),
        });
    }

    if let Some(value) = values.get("$float") {
        if values.len() != 1 {
            return Some(Err("$float payload must not include extra keys".to_owned()));
        }
        return Some(match value {
            JsonValue::String(text) => text
                .parse::<f64>()
                .map(MontyObject::Float)
                .map_err(|_| "invalid $float string".to_owned()),
            _ => Err("$float must be a string".to_owned()),
        });
    }

    if let Some(value) = values.get("$bytes") {
        if values.len() != 1 {
            return Some(Err("$bytes payload must not include extra keys".to_owned()));
        }
        return Some((|| {
            let Some(bytes) = value.as_array() else {
                return Err("$bytes must be an array".to_owned());
            };
            let mut out = Vec::with_capacity(bytes.len());
            for item in bytes {
                let Some(number) = item.as_u64() else {
                    return Err("$bytes values must be unsigned integers".to_owned());
                };
                let Ok(byte) = u8::try_from(number) else {
                    return Err("$bytes values must be within 0..=255".to_owned());
                };
                out.push(byte);
            }
            Ok(MontyObject::Bytes(out))
        })());
    }

    if let Some(value) = values.get("$tuple") {
        if values.len() != 1 {
            return Some(Err("$tuple payload must not include extra keys".to_owned()));
        }
        return Some((|| {
            let Some(items) = value.as_array() else {
                return Err("$tuple must be an array".to_owned());
            };
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(json_to_monty(item)?);
            }
            Ok(MontyObject::Tuple(out))
        })());
    }

    if let Some(value) = values.get("$set") {
        if values.len() != 1 {
            return Some(Err("$set payload must not include extra keys".to_owned()));
        }
        return Some((|| {
            let Some(items) = value.as_array() else {
                return Err("$set must be an array".to_owned());
            };
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(json_to_monty(item)?);
            }
            Ok(MontyObject::Set(out))
        })());
    }

    if let Some(value) = values.get("$frozenSet") {
        if values.len() != 1 {
            return Some(Err(
                "$frozenSet payload must not include extra keys".to_owned()
            ));
        }
        return Some((|| {
            let Some(items) = value.as_array() else {
                return Err("$frozenSet must be an array".to_owned());
            };
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(json_to_monty(item)?);
            }
            Ok(MontyObject::FrozenSet(out))
        })());
    }

    if let Some(value) = values.get("$dictPairs") {
        if values.len() != 1 {
            return Some(Err(
                "$dictPairs payload must not include extra keys".to_owned()
            ));
        }
        return Some((|| {
            let Some(items) = value.as_array() else {
                return Err("$dictPairs must be an array".to_owned());
            };
            let mut pairs = Vec::with_capacity(items.len());
            for item in items {
                let Some(pair) = item.as_array() else {
                    return Err("$dictPairs entries must be arrays".to_owned());
                };
                if pair.len() != 2 {
                    return Err("$dictPairs entries must have 2 elements".to_owned());
                }
                pairs.push((json_to_monty(&pair[0])?, json_to_monty(&pair[1])?));
            }
            Ok(MontyObject::dict(pairs))
        })());
    }

    if let Some(value) = values.get("$exception") {
        if values.len() != 1 {
            return Some(Err(
                "$exception payload must not include extra keys".to_owned()
            ));
        }
        return Some((|| {
            let Some(exception) = value.as_object() else {
                return Err("$exception must be an object".to_owned());
            };
            let Some(type_name) = exception
                .get("typeName")
                .or_else(|| exception.get("type"))
                .and_then(JsonValue::as_str)
            else {
                return Err("$exception.typeName must be a string".to_owned());
            };
            let exc_type = ExcType::from_str(type_name)
                .map_err(|_| format!("unknown exception type '{type_name}' in $exception"))?;
            let message = exception
                .get("message")
                .and_then(JsonValue::as_str)
                .map(ToOwned::to_owned);
            Ok(MontyObject::Exception {
                exc_type,
                arg: message,
            })
        })());
    }

    if let Some(value) = values.get("$path") {
        if values.len() != 1 {
            return Some(Err("$path payload must not include extra keys".to_owned()));
        }
        return Some(match value {
            JsonValue::String(path) => Ok(MontyObject::Path(path.clone())),
            _ => Err("$path must be a string".to_owned()),
        });
    }

    if let Some(value) = values.get("$namedTuple") {
        if values.len() != 1 {
            return Some(Err(
                "$namedTuple payload must not include extra keys".to_owned()
            ));
        }
        return Some((|| {
            let Some(named_tuple) = value.as_object() else {
                return Err("$namedTuple must be an object".to_owned());
            };
            let Some(type_name) = named_tuple.get("typeName").and_then(JsonValue::as_str) else {
                return Err("$namedTuple.typeName must be a string".to_owned());
            };
            let Some(field_names_raw) = named_tuple.get("fieldNames").and_then(JsonValue::as_array)
            else {
                return Err("$namedTuple.fieldNames must be an array".to_owned());
            };
            let Some(values_raw) = named_tuple.get("values").and_then(JsonValue::as_array) else {
                return Err("$namedTuple.values must be an array".to_owned());
            };

            let mut field_names = Vec::with_capacity(field_names_raw.len());
            for name in field_names_raw {
                let Some(name) = name.as_str() else {
                    return Err("$namedTuple.fieldNames entries must be strings".to_owned());
                };
                field_names.push(name.to_owned());
            }

            let mut values = Vec::with_capacity(values_raw.len());
            for item in values_raw {
                values.push(json_to_monty(item)?);
            }

            Ok(MontyObject::NamedTuple {
                type_name: type_name.to_owned(),
                field_names,
                values,
            })
        })());
    }

    if let Some(value) = values.get("$dataclass") {
        if values.len() != 1 {
            return Some(Err(
                "$dataclass payload must not include extra keys".to_owned()
            ));
        }
        return Some((|| {
            let Some(dataclass) = value.as_object() else {
                return Err("$dataclass must be an object".to_owned());
            };
            let Some(name) = dataclass.get("name").and_then(JsonValue::as_str) else {
                return Err("$dataclass.name must be a string".to_owned());
            };
            let Some(type_id) = dataclass.get("typeId").and_then(JsonValue::as_u64) else {
                return Err("$dataclass.typeId must be an unsigned integer".to_owned());
            };
            let Some(field_names_raw) = dataclass.get("fieldNames").and_then(JsonValue::as_array)
            else {
                return Err("$dataclass.fieldNames must be an array".to_owned());
            };
            let Some(attrs_raw) = dataclass.get("attrs") else {
                return Err("$dataclass.attrs is required".to_owned());
            };
            let Some(frozen) = dataclass.get("frozen").and_then(JsonValue::as_bool) else {
                return Err("$dataclass.frozen must be a boolean".to_owned());
            };

            let mut field_names = Vec::with_capacity(field_names_raw.len());
            for field_name in field_names_raw {
                let Some(field_name) = field_name.as_str() else {
                    return Err("$dataclass.fieldNames entries must be strings".to_owned());
                };
                field_names.push(field_name.to_owned());
            }

            let attrs = match json_to_monty(attrs_raw)? {
                MontyObject::Dict(attrs) => attrs,
                _ => return Err("$dataclass.attrs must decode to a dict".to_owned()),
            };

            Ok(MontyObject::Dataclass {
                name: name.to_owned(),
                type_id,
                field_names,
                attrs,
                frozen,
            })
        })());
    }

    if let Some(value) = values.get("$function") {
        if values.len() != 1 {
            return Some(Err(
                "$function payload must not include extra keys".to_owned()
            ));
        }
        return Some((|| {
            let Some(function) = value.as_object() else {
                return Err("$function must be an object".to_owned());
            };
            let Some(name) = function.get("name").and_then(JsonValue::as_str) else {
                return Err("$function.name must be a string".to_owned());
            };
            let docstring = function.get("docstring").and_then(|doc| match doc {
                JsonValue::Null => None,
                JsonValue::String(text) => Some(text.clone()),
                _ => Some(doc.to_string()),
            });
            Ok(MontyObject::Function {
                name: name.to_owned(),
                docstring,
            })
        })());
    }

    None
}

fn json_to_monty(value: &JsonValue) -> Result<MontyObject, String> {
    match value {
        JsonValue::Null => Ok(MontyObject::None),
        JsonValue::Bool(v) => Ok(MontyObject::Bool(*v)),
        JsonValue::Number(v) => {
            if let Some(i) = v.as_i64() {
                Ok(MontyObject::Int(i))
            } else if let Some(u) = v.as_u64() {
                if let Ok(i) = i64::try_from(u) {
                    Ok(MontyObject::Int(i))
                } else {
                    Ok(MontyObject::BigInt(BigInt::from(u)))
                }
            } else if let Some(f) = v.as_f64() {
                Ok(MontyObject::Float(f))
            } else {
                Err("unsupported numeric value".to_owned())
            }
        }
        JsonValue::String(v) => Ok(MontyObject::String(v.clone())),
        JsonValue::Array(values) => {
            let mut output = Vec::with_capacity(values.len());
            for item in values {
                output.push(json_to_monty(item)?);
            }
            Ok(MontyObject::List(output))
        }
        JsonValue::Object(values) => {
            if let Some(tagged) = parse_tagged_object(values) {
                return tagged;
            }

            let mut pairs = Vec::with_capacity(values.len());
            for (key, value) in values {
                pairs.push((MontyObject::String(key.clone()), json_to_monty(value)?));
            }
            Ok(MontyObject::dict(pairs))
        }
    }
}

fn monty_to_json(value: MontyObject) -> JsonValue {
    match value {
        MontyObject::Ellipsis => json!({ "$ellipsis": true }),
        MontyObject::None => JsonValue::Null,
        MontyObject::Bool(v) => JsonValue::Bool(v),
        MontyObject::Int(v) => JsonValue::Number(Number::from(v)),
        MontyObject::BigInt(v) => json!({ "$bigint": v.to_string() }),
        MontyObject::Float(v) => Number::from_f64(v)
            .map(JsonValue::Number)
            .unwrap_or_else(|| json!({ "$float": v.to_string() })),
        MontyObject::String(v) => JsonValue::String(v),
        MontyObject::Bytes(v) => json!({ "$bytes": v }),
        MontyObject::List(v) => JsonValue::Array(v.into_iter().map(monty_to_json).collect()),
        MontyObject::Tuple(v) => {
            json!({ "$tuple": v.into_iter().map(monty_to_json).collect::<Vec<_>>() })
        }
        MontyObject::NamedTuple {
            type_name,
            field_names,
            values,
        } => {
            json!({
                "$namedTuple": {
                    "typeName": type_name,
                    "fieldNames": field_names,
                    "values": values.into_iter().map(monty_to_json).collect::<Vec<_>>()
                }
            })
        }
        MontyObject::Dict(v) => {
            let mut obj = Map::new();
            let mut fallback_pairs = Vec::new();
            let mut only_string_keys = true;

            for (k, val) in v {
                match k {
                    MontyObject::String(key) => {
                        obj.insert(key, monty_to_json(val));
                    }
                    _ => {
                        only_string_keys = false;
                        fallback_pairs
                            .push(JsonValue::Array(vec![monty_to_json(k), monty_to_json(val)]));
                    }
                }
            }

            if only_string_keys {
                JsonValue::Object(obj)
            } else {
                json!({ "$dictPairs": fallback_pairs })
            }
        }
        MontyObject::Set(v) => {
            json!({ "$set": v.into_iter().map(monty_to_json).collect::<Vec<_>>() })
        }
        MontyObject::FrozenSet(v) => {
            json!({ "$frozenSet": v.into_iter().map(monty_to_json).collect::<Vec<_>>() })
        }
        MontyObject::Exception { exc_type, arg } => {
            json!({
                "$exception": {
                    "typeName": exc_type.to_string(),
                    "message": arg
                }
            })
        }
        MontyObject::Type(v) => json!({ "$type": v.to_string() }),
        MontyObject::BuiltinFunction(v) => json!({ "$builtinFunction": v.to_string() }),
        MontyObject::Path(v) => json!({ "$path": v }),
        MontyObject::Dataclass {
            name,
            type_id,
            field_names,
            attrs,
            frozen,
        } => {
            json!({
                "$dataclass": {
                    "name": name,
                    "typeId": type_id,
                    "fieldNames": field_names,
                    "attrs": monty_to_json(MontyObject::Dict(attrs)),
                    "frozen": frozen
                }
            })
        }
        MontyObject::Function { name, docstring } => json!({
            "$function": {
                "name": name,
                "docstring": docstring
            }
        }),
        MontyObject::Repr(v) => json!({ "$repr": v }),
        MontyObject::Cycle(id, placeholder) => json!({
            "$cycle": {
                "id": id,
                "placeholder": placeholder
            }
        }),
    }
}

fn kwargs_to_json(kwargs: &[(MontyObject, MontyObject)]) -> JsonValue {
    let mut result = Map::new();

    for (index, (key, value)) in kwargs.iter().enumerate() {
        let key_name = match key {
            MontyObject::String(text) => text.clone(),
            _ => {
                let encoded = serde_json::to_string(&monty_to_json(key.clone()))
                    .unwrap_or_else(|_| key.to_string());
                format!("$key_{index}_{encoded}")
            }
        };
        result.insert(key_name, monty_to_json(value.clone()));
    }

    JsonValue::Object(result)
}

fn exception_to_json(exception: MontyException) -> JsonValue {
    let type_name = exception.exc_type().to_string();
    let message = exception.message().unwrap_or_default().to_owned();
    let traceback = exception
        .traceback()
        .iter()
        .map(|frame| {
            json!({
                "filename": frame.filename,
                "line": frame.start.line,
                "column": frame.start.column,
                "endLine": frame.end.line,
                "endColumn": frame.end.column,
                "functionName": frame.frame_name,
                "sourceLine": frame.preview_line
            })
        })
        .collect::<Vec<_>>();

    json!({
        "ok": false,
        "error": {
            "typeName": type_name,
            "message": message,
            "traceback": traceback
        }
    })
}

fn snapshot_store() -> &'static Mutex<HashMap<String, StoredSnapshot>> {
    SNAPSHOT_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn insert_snapshot(snapshot: StoredSnapshot) -> String {
    let snapshot_id = format!(
        "snapshot-{}",
        NEXT_SNAPSHOT_ID.fetch_add(1, Ordering::Relaxed)
    );
    let mut guard = snapshot_store()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.insert(snapshot_id.clone(), snapshot);
    snapshot_id
}

fn take_snapshot(snapshot_id: &str) -> Option<StoredSnapshot> {
    let mut guard = snapshot_store()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.remove(snapshot_id)
}

fn restore_snapshot(snapshot_id: String, snapshot: StoredSnapshot) {
    let mut guard = snapshot_store()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.insert(snapshot_id, snapshot);
}

fn build_ordered_inputs(
    input_names: &[String],
    inputs_map: &Map<String, JsonValue>,
) -> Result<Vec<MontyObject>, JsonValue> {
    let mut ordered_inputs = Vec::with_capacity(input_names.len());

    for name in input_names {
        if let Some(raw_value) = inputs_map.get(name) {
            match json_to_monty(raw_value) {
                Ok(value) => ordered_inputs.push(value),
                Err(err) => {
                    return Err(error_json(
                        "TypeError",
                        format!("Invalid input '{name}': {err}"),
                    ));
                }
            }
        } else {
            ordered_inputs.push(MontyObject::None);
        }
    }

    Ok(ordered_inputs)
}

fn prepare_execution(
    run_options_json: Option<String>,
    monty_options_json: Option<String>,
) -> Result<(String, Vec<String>, Vec<MontyObject>), JsonValue> {
    let run_options = parse_json_or_default::<RunOptionsInput>(run_options_json);
    let monty_options = parse_json_or_default::<MontyOptionsInput>(monty_options_json);

    let script_name = monty_options
        .script_name
        .unwrap_or_else(|| "main.py".to_owned());
    let input_names = monty_options.inputs.unwrap_or_default();
    let inputs_map = run_options.inputs.unwrap_or_default();
    let ordered_inputs = build_ordered_inputs(&input_names, &inputs_map)?;

    Ok((script_name, input_names, ordered_inputs))
}

fn progress_to_json(script_name: String, progress: RunProgress<NoLimitTracker>) -> JsonValue {
    match progress {
        RunProgress::Complete(output) => json!({
            "ok": true,
            "state": "complete",
            "output": monty_to_json(output)
        }),
        RunProgress::FunctionCall(function_call) => {
            let function_name = function_call.function_name.clone();
            let args = function_call
                .args
                .clone()
                .into_iter()
                .map(monty_to_json)
                .collect::<Vec<_>>();
            let kwargs = kwargs_to_json(&function_call.kwargs);
            let snapshot_id = insert_snapshot(StoredSnapshot {
                script_name: script_name.clone(),
                state: SnapshotState::FunctionCall(function_call),
            });

            json!({
                "ok": true,
                "state": "functionCall",
                "snapshotId": snapshot_id,
                "scriptName": script_name,
                "functionName": function_name,
                "args": args,
                "kwargs": kwargs
            })
        }
        RunProgress::NameLookup(name_lookup) => {
            let variable_name = name_lookup.name.clone();
            let snapshot_id = insert_snapshot(StoredSnapshot {
                script_name: script_name.clone(),
                state: SnapshotState::NameLookup(name_lookup),
            });

            json!({
                "ok": true,
                "state": "nameLookup",
                "snapshotId": snapshot_id,
                "scriptName": script_name,
                "variableName": variable_name
            })
        }
        RunProgress::OsCall(os_call) => error_json(
            "NotImplementedError",
            format!(
                "OS call '{}' is not supported in monty-expo yet",
                os_call.function
            ),
        ),
        RunProgress::ResolveFutures(_) => error_json(
            "NotImplementedError",
            "ResolveFutures is not supported in monty-expo yet",
        ),
    }
}

fn run_monty(
    code: &str,
    run_options_json: Option<String>,
    monty_options_json: Option<String>,
) -> JsonValue {
    let (script_name, input_names, ordered_inputs) =
        match prepare_execution(run_options_json, monty_options_json) {
            Ok(prepared) => prepared,
            Err(error) => return error,
        };

    let runner = match MontyRun::new(code.to_owned(), &script_name, input_names) {
        Ok(runner) => runner,
        Err(exception) => return exception_to_json(exception),
    };

    match runner.run_no_limits(ordered_inputs) {
        Ok(output) => json!({
            "ok": true,
            "output": monty_to_json(output)
        }),
        Err(exception) => exception_to_json(exception),
    }
}

fn start_monty(
    code: &str,
    run_options_json: Option<String>,
    monty_options_json: Option<String>,
) -> JsonValue {
    let (script_name, input_names, ordered_inputs) =
        match prepare_execution(run_options_json, monty_options_json) {
            Ok(prepared) => prepared,
            Err(error) => return error,
        };

    let runner = match MontyRun::new(code.to_owned(), &script_name, input_names) {
        Ok(runner) => runner,
        Err(exception) => return exception_to_json(exception),
    };

    let mut print = PrintWriter::Disabled;
    match runner.start(ordered_inputs, NoLimitTracker, &mut print) {
        Ok(progress) => progress_to_json(script_name, progress),
        Err(exception) => exception_to_json(exception),
    }
}

fn exception_input_to_monty(exception: ExceptionInput) -> Result<MontyException, String> {
    let type_name = exception
        .exception_type
        .unwrap_or_else(|| "RuntimeError".to_owned());
    let exc_type = ExcType::from_str(&type_name)
        .map_err(|_| format!("Unknown exception type '{type_name}'"))?;
    Ok(MontyException::new(exc_type, exception.message))
}

fn resume_monty(snapshot_id: &str, resume_options_json: Option<String>) -> JsonValue {
    if snapshot_id.trim().is_empty() {
        return error_json("TypeError", "snapshotId is empty");
    }

    let resume_options = parse_json_or_default::<ResumeOptionsInput>(resume_options_json);

    let snapshot = match take_snapshot(snapshot_id) {
        Some(snapshot) => snapshot,
        None => {
            return error_json(
                "RuntimeError",
                format!("Unknown or already-resumed snapshot '{snapshot_id}'"),
            );
        }
    };

    let StoredSnapshot { script_name, state } = snapshot;

    match state {
        SnapshotState::FunctionCall(function_call) => {
            let ext_result = if let Some(exception_input) = resume_options.exception {
                match exception_input_to_monty(exception_input) {
                    Ok(exception) => ExtFunctionResult::Error(exception),
                    Err(err) => {
                        restore_snapshot(
                            snapshot_id.to_owned(),
                            StoredSnapshot {
                                script_name,
                                state: SnapshotState::FunctionCall(function_call),
                            },
                        );
                        return error_json("TypeError", err);
                    }
                }
            } else {
                let return_json = resume_options.return_value.unwrap_or(JsonValue::Null);
                match json_to_monty(&return_json) {
                    Ok(value) => ExtFunctionResult::Return(value),
                    Err(err) => {
                        restore_snapshot(
                            snapshot_id.to_owned(),
                            StoredSnapshot {
                                script_name,
                                state: SnapshotState::FunctionCall(function_call),
                            },
                        );
                        return error_json(
                            "TypeError",
                            format!("Invalid resume return value: {err}"),
                        );
                    }
                }
            };

            let mut print = PrintWriter::Disabled;
            match function_call.resume(ext_result, &mut print) {
                Ok(progress) => progress_to_json(script_name, progress),
                Err(exception) => exception_to_json(exception),
            }
        }
        SnapshotState::NameLookup(name_lookup) => {
            let lookup_result = if let Some(value_json) = resume_options.value {
                match json_to_monty(&value_json) {
                    Ok(value) => NameLookupResult::Value(value),
                    Err(err) => {
                        restore_snapshot(
                            snapshot_id.to_owned(),
                            StoredSnapshot {
                                script_name,
                                state: SnapshotState::NameLookup(name_lookup),
                            },
                        );
                        return error_json(
                            "TypeError",
                            format!("Invalid name lookup value: {err}"),
                        );
                    }
                }
            } else {
                NameLookupResult::Undefined
            };

            let mut print = PrintWriter::Disabled;
            match name_lookup.resume(lookup_result, &mut print) {
                Ok(progress) => progress_to_json(script_name, progress),
                Err(exception) => exception_to_json(exception),
            }
        }
    }
}

fn to_c_string(json_value: JsonValue) -> *mut c_char {
    let text = json_value.to_string();
    match CString::new(text) {
        Ok(value) => value.into_raw(),
        Err(_) => CString::new(error_json("RuntimeError", "failed to encode output").to_string())
            .expect("static string to cstring")
            .into_raw(),
    }
}

fn run_and_serialize(
    code: *const c_char,
    run_options_json: *const c_char,
    monty_options_json: *const c_char,
) -> JsonValue {
    if code.is_null() {
        return error_json("TypeError", "code is null");
    }

    let code_string = c_char_ptr_to_string(code).unwrap_or_default();
    let run_options = c_char_ptr_to_string(run_options_json);
    let monty_options = c_char_ptr_to_string(monty_options_json);
    run_monty(&code_string, run_options, monty_options)
}

fn start_and_serialize(
    code: *const c_char,
    run_options_json: *const c_char,
    monty_options_json: *const c_char,
) -> JsonValue {
    if code.is_null() {
        return error_json("TypeError", "code is null");
    }

    let code_string = c_char_ptr_to_string(code).unwrap_or_default();
    let run_options = c_char_ptr_to_string(run_options_json);
    let monty_options = c_char_ptr_to_string(monty_options_json);
    start_monty(&code_string, run_options, monty_options)
}

fn resume_and_serialize(
    snapshot_id: *const c_char,
    resume_options_json: *const c_char,
) -> JsonValue {
    if snapshot_id.is_null() {
        return error_json("TypeError", "snapshotId is null");
    }

    let snapshot_id_string = c_char_ptr_to_string(snapshot_id).unwrap_or_default();
    let resume_options = c_char_ptr_to_string(resume_options_json);
    resume_monty(&snapshot_id_string, resume_options)
}

#[no_mangle]
pub extern "C" fn monty_expo_run_json(
    code: *const c_char,
    run_options_json: *const c_char,
    monty_options_json: *const c_char,
) -> *mut c_char {
    to_c_string(run_and_serialize(
        code,
        run_options_json,
        monty_options_json,
    ))
}

#[no_mangle]
pub extern "C" fn monty_expo_start_json(
    code: *const c_char,
    run_options_json: *const c_char,
    monty_options_json: *const c_char,
) -> *mut c_char {
    to_c_string(start_and_serialize(
        code,
        run_options_json,
        monty_options_json,
    ))
}

#[no_mangle]
pub extern "C" fn monty_expo_resume_json(
    snapshot_id: *const c_char,
    resume_options_json: *const c_char,
) -> *mut c_char {
    to_c_string(resume_and_serialize(snapshot_id, resume_options_json))
}

#[no_mangle]
pub extern "C" fn monty_expo_string_free(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(CString::from_raw(ptr));
    }
}

#[cfg(feature = "android")]
mod android {
    use std::ffi::CString;

    use jni::{
        objects::{JClass, JObject, JString},
        sys::jstring,
        JNIEnv,
    };

    use crate::{resume_monty, run_monty, start_monty};

    fn jstring_to_option_string(env: &mut JNIEnv<'_>, value: JObject<'_>) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let j_string = JString::from(value);
        env.get_string(&j_string)
            .ok()
            .map(|s| s.to_string_lossy().into_owned())
    }

    fn output_to_jstring(env: &mut JNIEnv<'_>, output: String) -> jstring {
        let c_string = CString::new(output).unwrap_or_else(|_| {
            CString::new(
                "{\"ok\":false,\"error\":{\"typeName\":\"RuntimeError\",\"message\":\"jni encoding failed\",\"traceback\":[]}}",
            )
            .expect("static fallback string to cstring")
        });
        match env.new_string(c_string.to_string_lossy().as_ref()) {
            Ok(v) => v.into_raw(),
            Err(_) => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_montyexpo_MontyRustBridge_nativeRun(
        mut env: JNIEnv<'_>,
        _class: JClass<'_>,
        code: JString<'_>,
        run_options_json: JObject<'_>,
        monty_options_json: JObject<'_>,
    ) -> jstring {
        let code_string = match env.get_string(&code) {
            Ok(v) => v.to_string_lossy().into_owned(),
            Err(_) => String::new(),
        };
        let run_options = jstring_to_option_string(&mut env, run_options_json);
        let monty_options = jstring_to_option_string(&mut env, monty_options_json);
        let output = run_monty(&code_string, run_options, monty_options).to_string();
        output_to_jstring(&mut env, output)
    }

    #[no_mangle]
    pub extern "system" fn Java_com_montyexpo_MontyRustBridge_nativeStart(
        mut env: JNIEnv<'_>,
        _class: JClass<'_>,
        code: JString<'_>,
        run_options_json: JObject<'_>,
        monty_options_json: JObject<'_>,
    ) -> jstring {
        let code_string = match env.get_string(&code) {
            Ok(v) => v.to_string_lossy().into_owned(),
            Err(_) => String::new(),
        };
        let run_options = jstring_to_option_string(&mut env, run_options_json);
        let monty_options = jstring_to_option_string(&mut env, monty_options_json);
        let output = start_monty(&code_string, run_options, monty_options).to_string();
        output_to_jstring(&mut env, output)
    }

    #[no_mangle]
    pub extern "system" fn Java_com_montyexpo_MontyRustBridge_nativeResume(
        mut env: JNIEnv<'_>,
        _class: JClass<'_>,
        snapshot_id: JString<'_>,
        resume_options_json: JObject<'_>,
    ) -> jstring {
        let snapshot_id_string = match env.get_string(&snapshot_id) {
            Ok(v) => v.to_string_lossy().into_owned(),
            Err(_) => String::new(),
        };
        let resume_options = jstring_to_option_string(&mut env, resume_options_json);
        let output = resume_monty(&snapshot_id_string, resume_options).to_string();
        output_to_jstring(&mut env, output)
    }
}
