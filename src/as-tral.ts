#!/usr/bin/env node

import path from "path";
import sfs from "fs";
import fs from "fs/promises";
import glob from "fast-glob";
import { exit } from "process";
import chalk from "chalk";

import asc from "assemblyscript/dist/asc.js";

const __dirname = new URL('.', import.meta.url).pathname;
const decoder = new TextDecoder();

const fileMap = new Map<string, string>();
const folderMap = new Map<string, string[]>();

let files;
try {
    files = await glob("assembly/__benches__/**/*.ts");
} catch (e: any) {
    console.log("ERROR: could not find directory " + e.path);
    exit(1);
}

for (const file of files) {
    compileFile(file);
}

async function compileFile(file: string) {
    const fileName = path.basename(file);
    console.log(`Compiling ${path.relative(".", file)}`);

    let binaryOrNull: Uint8Array | null = null;
    let infoOrNull: Info | null = null;
    const { error } = await asc.main(
        [file, "--transform", path.join(__dirname, "transform.js"), "-o", fileName + ".wasm", "-t", fileName + ".wat", "--optimize"],
        {
            stdout: process.stdout,
            stderr: process.stderr,
            writeFile(name: string, contents: Uint8Array) {
                if (name == "__astralinfo__") {
                    infoOrNull = JSON.parse(decoder.decode(contents));
                    return;
                }

                const ext = path.extname(name);

                if (ext === ".wasm") {
                    binaryOrNull = contents;
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
        }
    );

    if (error) {
        console.log("Errors found during compilation:");
        console.log(error);
        return;
    }

    if (binaryOrNull === null) {
        console.log("ERROR: No binary found.");
        console.log("Emitting errors during compilation:");
        console.log(error);
        return;
    }

    if (infoOrNull === null) {
        console.log("ERROR: No bench settings found.");
        console.log("Emitting errors during compilation:");
        console.log(error);
        return;
    }

    // https://github.com/Microsoft/TypeScript/issues/11498
    await benchWASM(infoOrNull, binaryOrNull);
}

async function benchWASM(info: Info, binary: Uint8Array) {
    let currentBench = "";
    await WebAssembly.instantiate(binary, {
        __astral__: {
            now: performance.now,
            warmup(descriptor: number) {
                currentBench = info.enumeration[descriptor];
                console.log();
                console.log(
                    `Benchmarking ${currentBench}: Warming up for ${formatTime(
                        info.warmupTime
                    )}`
                );
            },
            start(estimatedMs: number, iterCount: number) {
                console.log(
                    `Benchmarking ${currentBench}: Collecting ${info.sampleSize
                    } samples in estimated ${formatTime(
                        estimatedMs
                    )} (${formatIterCount(iterCount)})`
                );
            },
            analyzing() {
                console.log(`Benchmarking ${currentBench}: Analyzing`);
            },
            faultyConfig(
                linear: number,
                actualTime: number,
                recommendedSampleSize: number
            ) {
                let msg = `Warning: Unable to complete ${info.sampleSize
                    } samples in ${formatTime(
                        info.measurementTime
                    )}. You may wish to increase target time to ${actualTime}`;

                if (linear == 1) {
                    if (info.sampleSize != recommendedSampleSize) {
                        msg += `, enable flat sampling, or reduce sample count to ${recommendedSampleSize}`;
                    } else {
                        msg += ` or enable flat sampling.`;
                    }
                } else if (info.sampleSize != recommendedSampleSize) {
                    msg += `or reduce sample count to ${recommendedSampleSize}`;
                } else {
                    msg += `.`;
                }

                console.log(msg);
            },
            faultyBenchmark() {
                console.log(
                    `At least one measurement of benchmark ${currentBench} took zero time per iteration. This should not be possible. Please verify that you have blackboxed both your function arguments and return values.`
                );
            },
            result(lb: number, time: number, hb: number) {
                const header =
                    currentBench + " ".repeat(24 - currentBench.length);
                const lbs = formatTime(lb);
                const times = formatTime(time);
                const hbs = formatTime(hb);

                console.log(
                    chalk`${header}time: [{gray ${lbs}} {bold ${times}} {gray ${hbs}}]`
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

function short(n: number): string {
    if (n < 10) {
        return (~~(n * 1e4) / 1e4).toString();
    } else if (n < 100) {
        return (~~(n * 1e3) / 1e3).toString();
    } else if (n < 1000) {
        return (~~(n * 1e2) / 1e2).toString();
    } else if (n < 10000) {
        return (~~(n * 1e1) / 1e1).toString();
    } else {
        return (~~n).toString();
    }
}

function formatTime(ms: number): string {
    if (ms < 10e-6) {
        return short(ms * 1e9) + "ps";
    } else if (ms < 10e-3) {
        return short(ms * 1e6) + "ns";
    } else if (ms < 10) {
        return short(ms * 1e3) + "us";
    } else if (ms < 10e3) {
        return short(ms) + "ms";
    } else {
        return short(ms * 1e-3) + "s";
    }
}

function formatIterCount(i: number) {
    if (i < 10e3) {
        return `${i} iterations`;
    } else if (i < 1e6) {
        return `${~~(i / 1000)}k iterations`;
    } else if (i < 10e6) {
        return `${~~(i / 1e5) / 10}M iterations`;
    } else if (i < 1e9) {
        return `${~~(i / 1e6)}M iterations`;
    } else if (i < 10e9) {
        return `${~~(i / 1e8) / 10}B iterations`;
    } else {
        return `${~~(i / 1e9)}B iterations`;
    }
}