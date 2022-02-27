#!/usr/bin/env node

import path from "path";
import sfs from "fs";
import fs from "fs/promises";
import glob from "fast-glob";
import { exit } from "process";
import chalk from "chalk";

const asc: any = require("assemblyscript/dist/asc");

const decoder = new TextDecoder();
(async () => {
	const fileMap = new Map<string, string>();
	const folderMap = new Map<string, string[]>();

	await asc.ready;

	let files;
	try {
		files = await glob("assembly/__benches__/**/*.ts");
	} catch (e: any) {
		console.log("ERROR: could not find directory " + e.path);
		exit(1);
	}

	for (const file of files) {
		console.log(`Compiling ${path.relative(".", file)}`);

		let binary: Uint8Array;
		let info: Info;
		asc.main(
			[file, "--transform", path.join(__dirname, "transform.js"), "--optimize"],
			{
				stdout: process.stdout,
				stderr: process.stderr,
				writeFile(name: string, contents: Uint8Array, baseDir: string = ".") {
					if (name == "__astralinfo__") {
						info = JSON.parse(decoder.decode(contents));
						return;
					}

					const ext = path.extname(name);

					if (ext === ".wasm") {
						binary = contents;
					} else if (ext === ".ts" || ext === ".map") {
						return;
					}

					const outfileName = path.join(
						path.dirname(file),
						path.basename(file, path.extname(file)) + ext
					);

					fs.writeFile(outfileName, contents);
				},
				readFile(filename: string, baseDir: string) {
					const fileName = path.join(baseDir, filename);
					if (fileMap.has(fileName)) {
						return fileMap.get(fileName)!;
					}

					try {
						const contents = sfs.readFileSync(fileName, { encoding: "utf8" });
						fileMap.set(fileName, contents);
						return contents;
					} catch (e) {
						return null;
					}
				},
				listFiles(dirname: string, baseDir: string): string[] {
					const folder = path.join(baseDir, dirname);
					if (folderMap.has(folder)) {
						return folderMap.get(folder)!;
					}

					try {
						const results = sfs
							.readdirSync(folder)
							.filter(file => /^(?!.*\.d\.ts$).*\.ts$/.test(file));
						folderMap.set(folder, results);
						return results;
					} catch (e) {
						return [];
					}
				}
			},
			async (error: any) => {
				if (error) {
					console.log("Errors found during compilation:");
					console.log(error);
					return;
				}

				await WebAssembly.instantiate(binary, {
					__astral__: {
						now: performance.now,
						warmup(descriptor: number) {
							console.log(
								`${info.enumeration[descriptor]}: warming up for ${
									info.warmupTime / 1000
								} seconds.`
							);
						},
						result(lb: number, time: number, hb: number) {
							// TODO: correct units
							lb = ~~(lb * 1e6);
							time = ~~(time * 1e6);
							hb = ~~(hb * 1e6);
							console.log(
								chalk`time: [{gray ${lb}ns} {bold ${time}ns} {gray ${hb}ns}]`
							);
						},
						outliers(los: number, lom: number, him: number, his: number) {
							const noutliers = los + lom + him + his;

							if (noutliers == 0) {
								return;
							}

							const percent = (n: number) => (100 * n) / info.sampleSize;
							const formatPercent = (n: number) => ~~(n * 100) / 100;
							const nopercent = formatPercent(percent(noutliers));

							console.log(
								chalk.yellow(
									`Found ${noutliers} outliers among ${info.sampleSize} measurements (${nopercent}%)`
								)
							);

							const print = (n: number, label: string) => {
								if (n != 0) {
									console.log(
										`  ${n} (${formatPercent(percent(n))}%) ${label}`
									);
								}
							};

							print(los, "low severe");
							print(lom, "low mild");
							print(him, "high mild");
							print(his, "high severe");
						}
					},
					env: {
						seed: Date.now,
						abort() {
							console.log("wasm module aborted");
						}
					}
				});
			}
		);
	}
})();
