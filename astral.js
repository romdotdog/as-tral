#!/usr/bin/env node

const path = require("path");
const fs = require("fs/promises");
const { exit } = require("process");
const asc = require("assemblyscript/dist/asc");

async function search(dir) {
	const dirents = await fs.readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		dirents.map(dirent => {
			const res = path.resolve(dir, dirent.name);
			return dirent.isDirectory() ? search(res) : res;
		})
	);

	return files;
}

(async () => {
	await asc.ready;

	const main = await fs.readFile(path.join(__dirname, "assembly/main.ts"));

	let files;
	try {
		files = await search("assembly/__benches__");
	} catch (e) {
		console.log("ERROR: could not find directory " + e.path);
		exit(1);
	}

	files = files.flat();
	for (const filePath of files) {
		console.log(`Compiling ${path.relative(".", filePath)}`);
		const file = await fs.readFile(filePath);
		const { binary, text, stdout, stderr } = asc.compileString(main + file, {
			optimize: 2
		});

		console.log(stdout.toString());

		if (stderr[0]) {
			console.log("Errors found during compilation:");
			console.log(stderr.toString());
			continue;
		}

		await WebAssembly.instantiate(binary, {
			input: {
				now: performance.now,
				result(time) {
					console.log(((time * 1e6) >> 0) + "ns");
				}
			},
			env: {
				abort() {
					console.log("wasm module aborted");
				}
			}
		});
	}
})();
