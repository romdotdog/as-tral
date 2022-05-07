import { Transform } from "assemblyscript/dist/transform.js";
import {
    Node,
    NodeKind,
    Parser,
    CallExpression,
    ExpressionStatement,
    IdentifierExpression,
    LiteralExpression,
    LiteralKind,
    StringLiteralExpression,
    ObjectLiteralExpression,
    FloatLiteralExpression,
    IntegerLiteralExpression,
    CommonFlags,
    DiagnosticCode,
    Expression
} from "assemblyscript/dist/assemblyscript.js";

import { join } from "path";
import { readFileSync } from "fs";

// sort of a hack to get globals exported
const reexport = [
    "baselineIters",
    "baselineTimes",
    "flags",

    "meanLB",
    "meanHB",
    "meanPoint",
    "meanError",

    "medianLB",
    "medianHB",
    "medianPoint",
    "medianError",

    "MADLB",
    "MADHB",
    "MADPoint",
    "MADError",

    "slopeLB",
    "slopeHB",
    "slopePoint",
    "slopeError",

    "stdDevLB",
    "stdDevHB",
    "stdDevPoint",
    "stdDevError",
];

const __dirname = new URL('.', import.meta.url).pathname;
const lib = readFileSync(join(__dirname, "../assembly/main.ts"), {
    encoding: "utf8"
});

function readNumberOrFloat(node: Node): number | null {
    if (node.kind == NodeKind.LITERAL) {
        const literal = <LiteralExpression>node;
        switch (literal.literalKind) {
            case LiteralKind.FLOAT:
                return (<FloatLiteralExpression>literal).value;
            case LiteralKind.INTEGER: {
                const val = (<IntegerLiteralExpression>literal).value;
                return i64_low(val);
            }
        }
    }
    return null;
}

function readString(node: Node): string | null {
    return node.isLiteralKind(LiteralKind.STRING)
        ? (<StringLiteralExpression>node).value
        : null;
}

const encoder = new TextEncoder();
class Astral extends Transform {
    afterParse(parser: Parser) {
        const info: Info = {
            enumeration: [],
            warmupTime: 3000,
            measurementTime: 5000,
            sampleSize: 100,
            numResamples: 100_000,
            samplingMode: 0,
            confidenceLevel: 0.95,
            significanceLevel: 0.05,
            noiseThreshold: 0.01
        };
        for (const src of parser.sources) {
            if (src.isLibrary) continue;
            const range = src.range;
            const imp = Node.createImportStatement(
                [
                    Node.createImportDeclaration(
                        Node.createIdentifierExpression("bench", range),
                        null,
                        range
                    ),
                    Node.createImportDeclaration(
                        Node.createIdentifierExpression("blackbox", range),
                        null,
                        range
                    ),
                ],
                Node.createStringLiteralExpression("__astral__", range),
                range
            );

            const exp = Node.createExportStatement(
                reexport.map(v => Node.createExportMember(
                    Node.createIdentifierExpression(v, range),
                    null,
                    range
                )),
                Node.createStringLiteralExpression("__astral__", range),
                false,
                range
            );

            src.statements.unshift(imp, exp);
            for (let i = 0; i < src.statements.length; i++) {
                const stmt = src.statements[i];
                if (stmt.kind == NodeKind.EXPRESSION) {
                    const expr = (<ExpressionStatement>stmt).expression;
                    if (expr.kind == NodeKind.CALL) {
                        const call = <CallExpression>expr;
                        if (call.expression.kind != NodeKind.IDENTIFIER) continue;

                        const functionName = (<IdentifierExpression>call.expression).text;

                        switch (functionName) {
                            case "set": {
                                if (call.args.length != 1) continue;
                                const settings = call.args[0];

                                if (
                                    settings.kind != NodeKind.LITERAL ||
                                    (<LiteralExpression>settings).literalKind !=
                                    LiteralKind.OBJECT
                                )
                                    continue;

                                const settingsObject = <ObjectLiteralExpression>settings;
                                for (let i = 0, l = settingsObject.names.length; i < l; ++i) {
                                    // https://github.com/bheisler/criterion.rs/blob/970aa04aa5ee0514d1930c83a58c6ca994727567/src/lib.rs#L504
                                    switch (settingsObject.names[i].text) {
                                        // TODO: refactor?
                                        case "warmupTime": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this warmupTime is invalid."
                                                );
                                                continue;
                                            } else if (num <= 0) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "warmupTime must be greater than 0."
                                                );
                                                continue;
                                            }
                                            info.warmupTime = num;
                                            break;
                                        }
                                        case "measurementTime": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this measurementTime is invalid."
                                                );
                                                continue;
                                            } else if (num <= 0) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "measurementTime must be greater than 0."
                                                );
                                                continue;
                                            }
                                            info.measurementTime = num;
                                            break;
                                        }
                                        case "sampleSize": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this sampleSize is invalid."
                                                );
                                                continue;
                                            } else if (num < 10) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "sampleSize must be at least 10."
                                                );
                                                continue;
                                            }
                                            info.sampleSize = num;
                                            break;
                                        }
                                        case "numResamples": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this numResamples is invalid."
                                                );
                                                continue;
                                            } else if (num < 1000) {
                                                parser.warning(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "Setting numResamples below 1000 is not recommended."
                                                );
                                                continue;
                                            }
                                            info.numResamples = num;
                                            break;
                                        }
                                        case "samplingMode": {
                                            const val = settingsObject.values[i];
                                            const mode = readString(val);
                                            switch (mode) {
                                                case "auto":
                                                    info.samplingMode = 0;
                                                    break;
                                                case "linear":
                                                    info.samplingMode = 1;
                                                    break;
                                                case "flat":
                                                    info.samplingMode = 2;
                                                    break;
                                                default:
                                                    parser.error(
                                                        DiagnosticCode.Transform_0_1,
                                                        val.range,
                                                        "as-tral",
                                                        "this samplingMode is invalid."
                                                    );
                                            }
                                            break;
                                        }
                                        case "confidenceLevel": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this confidenceLevel is invalid."
                                                );
                                                continue;
                                            } else if (num <= 0 || num >= 1) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "confidenceLevel must be between 0 and 1."
                                                );
                                                continue;
                                            } else if (num < 0.5) {
                                                parser.warning(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "Setting confidenceLevel below 0.5 is not recommended."
                                                );
                                            }
                                            info.confidenceLevel = num;
                                            break;
                                        }
                                        case "significanceLevel": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this significanceLevel is invalid."
                                                );
                                                continue;
                                            } else if (num <= 0 || num >= 1) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "significanceLevel must be between 0 and 1."
                                                );
                                                continue;
                                            }
                                            info.significanceLevel = num;
                                            break;
                                        }
                                        case "noiseThreshold": {
                                            const val = settingsObject.values[i];
                                            const num = readNumberOrFloat(val);
                                            if (num === null) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "this noiseThreshold is invalid."
                                                );
                                                continue;
                                            } else if (num < 0) {
                                                parser.error(
                                                    DiagnosticCode.Transform_0_1,
                                                    val.range,
                                                    "as-tral",
                                                    "noiseThreshold must be at least 0."
                                                );
                                                continue;
                                            }
                                            info.noiseThreshold = num;
                                            break;
                                        }
                                    }
                                }

                                src.statements.splice(i--, 1);
                                break;
                            }
                            case "bench": {
                                if (call.args.length != 2) continue;
                                const string = call.args[0];

                                if (
                                    string.kind != NodeKind.LITERAL ||
                                    (<LiteralExpression>string).literalKind != LiteralKind.STRING
                                )
                                    continue;

                                call.args[0] = Node.createIntegerLiteralExpression(
                                    i64_new(info.enumeration.length),
                                    string.range
                                );

                                info.enumeration.push((<StringLiteralExpression>string).value);
                                break;
                            }
                        }
                    }
                }
            }
        }

        parser.parseFile(lib, "~lib/__astral__.ts", false);
        const src = parser.sources[parser.sources.length - 1]!;

        function createGlobal(name: keyof Settings, type: "f64" | "u32") {
            let expr: Expression;
            if (type == "f64") {
                expr = Node.createFloatLiteralExpression(info[name], src.range);
            } else {
                expr = Node.createIntegerLiteralExpression(
                    i64_new(info[name]),
                    src.range
                );
            }

            return Node.createVariableDeclaration(
                Node.createIdentifierExpression("__astral__" + name, src.range),
                null,
                CommonFlags.CONST,
                null,
                expr,
                src.range
            );
        }

        src.statements.unshift(
            Node.createVariableStatement(
                null,
                [
                    createGlobal("warmupTime", "f64"),
                    createGlobal("measurementTime", "f64"),
                    createGlobal("sampleSize", "u32"),
                    createGlobal("numResamples", "u32"),
                    createGlobal("samplingMode", "u32"),
                    createGlobal("confidenceLevel", "f64"),
                    createGlobal("significanceLevel", "f64"),
                    createGlobal("noiseThreshold", "f64")
                ],
                src.range
            )
        );

        this.writeFile("__astralinfo__", encoder.encode(JSON.stringify(info)), ".");
    }
}

export default Astral;