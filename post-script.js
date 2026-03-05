const path = require("node:path");
const { writeFile, readFile } = require("node:fs/promises");

async function patchAndroidOnLoad() {
  const onLoadFile = path.join(process.cwd(), "nitrogen/generated/android", "MontyExpoOnLoad.cpp");
  const content = await readFile(onLoadFile, { encoding: "utf8" });
  await writeFile(onLoadFile, content.replace(/margelo\/nitro\//g, ""));
}

patchAndroidOnLoad();
