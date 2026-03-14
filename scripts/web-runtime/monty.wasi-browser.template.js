import {
  getDefaultContext as __emnapiGetDefaultContext,
  instantiateNapiModule as __emnapiInstantiateNapiModule,
  WASI as __WASI,
} from '@napi-rs/wasm-runtime'

const __wasi = new __WASI({
  version: 'preview1',
})

const __wasmUrl = require('./monty.wasm32-wasi.wasm')
const __emnapiContext = __emnapiGetDefaultContext()

const __sharedMemory = new WebAssembly.Memory({
  initial: 4000,
  maximum: 65536,
  shared: true,
})

let __napiModule = null
let __initPromise = null

export let Monty
export let MontyComplete
export let MontyException
export let JsMontyException
export let MontyNameLookup
export let MontyRepl
export let MontySnapshot
export let MontyTypingError

async function __createNapiModule() {
  const { napiModule } = await __emnapiInstantiateNapiModule(__wasmUrl, {
    context: __emnapiContext,
    asyncWorkPoolSize: 0,
    wasi: __wasi,
    overwriteImports(importObject) {
      importObject.env = {
        ...importObject.env,
        ...importObject.napi,
        ...importObject.emnapi,
        memory: __sharedMemory,
      }
      return importObject
    },
    beforeInit({ instance }) {
      for (const name of Object.keys(instance.exports)) {
        if (name.startsWith('__napi_register__')) {
          instance.exports[name]()
        }
      }
    },
  })

  return napiModule
}

function __assignExports() {
  Monty = __napiModule.exports.Monty
  MontyComplete = __napiModule.exports.MontyComplete
  MontyException = __napiModule.exports.MontyException
  JsMontyException = __napiModule.exports.JsMontyException
  MontyNameLookup = __napiModule.exports.MontyNameLookup
  MontyRepl = __napiModule.exports.MontyRepl
  MontySnapshot = __napiModule.exports.MontySnapshot
  MontyTypingError = __napiModule.exports.MontyTypingError
}

export async function initMontyWasm() {
  if (__napiModule) {
    return __napiModule.exports
  }

  if (!__initPromise) {
    __initPromise = __createNapiModule().then((moduleValue) => {
      __napiModule = moduleValue
      __assignExports()
      return __napiModule.exports
    })
  }

  return __initPromise
}

function __ensureInitialized() {
  if (!__napiModule) {
    throw new Error('Monty WASM runtime is not initialized. Call loadMonty() before using Monty APIs.')
  }
  return __napiModule.exports
}

const __defaultExports = new Proxy(
  {},
  {
    get(_target, prop) {
      return __ensureInitialized()[prop]
    },
    ownKeys() {
      return Reflect.ownKeys(__ensureInitialized())
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(__ensureInitialized(), prop)
    },
  },
)

export default __defaultExports
