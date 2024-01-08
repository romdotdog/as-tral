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
    Expression,
    Statement,
    FunctionExpression,
    BlockStatement
} from "assemblyscript/dist/assemblyscript.js";

import { join, dirname } from "path";
import { fileURLToPath } from "url";
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
    "stdDevError"
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const lib = readFileSync(join(__dirname, "../assembly/main.ts"), {
    encoding: "utf8"
});

function readNumberOrFloat(node: Node): number | null {
    if (node.kind == NodeKind.Literal) {
        const literal = <LiteralExpression>node;
        switch (literal.literalKind) {
            case LiteralKind.Float:
                return (<FloatLiteralExpression>literal).value;
            case LiteralKind.Integer: {
                const val = (<IntegerLiteralExpression>literal).value;
                return i64_low(val);
            }
        }
    }
    return null;
}

function readString(node: Node): string | null {
    return node.isLiteralKind(LiteralKind.String) ? (<StringLiteralExpression>node).value : null;
}

type ParseableCall = ExpressionStatement & {
    expression: CallExpression & { expression: IdentifierExpression };
};

function isParseableCall(stmt: Statement): stmt is ParseableCall {
    if (stmt.kind == NodeKind.Expression) {
        const expr = (<ExpressionStatement>stmt).expression;
        if (expr.kind == NodeKind.Call) {
            const call = <CallExpression>expr;
            if (call.expression.kind != NodeKind.Identifier) return false;

            return true;
        }
    }
    return false;
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
                    Node.createImportDeclaration(Node.createIdentifierExpression("bench", range), null, range),
                    Node.createImportDeclaration(Node.createIdentifierExpression("blackbox", range), null, range)
                ],
                Node.createStringLiteralExpression("__astral__", range),
                range
            );

            const exp = Node.createExportStatement(
                reexport.map(v => Node.createExportMember(Node.createIdentifierExpression(v, range), null, range)),
                Node.createStringLiteralExpression("__astral__", range),
                false,
                range
            );

            src.statements.unshift(imp, exp);
            for (let i = 0; i < src.statements.length; i++) {
                const stmt = src.statements[i];
                if (isParseableCall(stmt)) {
                    const call = stmt.expression;
                    if (call.expression.text === "set") {
                        if (call.args.length != 1) continue;
                        const settings = call.args[0];

                        if (
                            settings.kind != NodeKind.Literal ||
                            (<LiteralExpression>settings).literalKind != LiteralKind.Object
                        )
                            continue;

                        const settingsObject = <ObjectLiteralExpression>settings;
                        for (let i = 0, l = settingsObject.names.length; i < l; ++i) {
                            parseSetting(parser, info, settingsObject.names[i], settingsObject.values[i]);
                        }

                        src.statements.splice(i--, 1);
                    } else {
                        traverseSuitesAndBenches(info, stmt);
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
                expr = Node.createIntegerLiteralExpression(i64_new(info[name]), src.range);
            }

            return Node.createVariableDeclaration(
                Node.createIdentifierExpression("__astral__" + name, src.range),
                null,
                CommonFlags.Const,
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

function traverseSuitesAndBenches(info: Info, stmt: ParseableCall) {
    const call = stmt.expression;
    if (call.expression.text === "bench") {
        if (call.args.length != 2) return;
        const string = call.args[0];

        if (string.kind != NodeKind.Literal || (<LiteralExpression>string).literalKind != LiteralKind.String) return;

        call.args[0] = Node.createIntegerLiteralExpression(i64_new(info.enumeration.length), string.range);

        info.enumeration.push((<StringLiteralExpression>string).value);
    } else if (call.expression.text === "suite") {
        if (call.args.length != 2) return;
        const string = call.args[0];

        if (string.kind != NodeKind.Literal || (<LiteralExpression>string).literalKind != LiteralKind.String) return;

        const lambda = call.args[1];

        if (lambda.kind != NodeKind.Function) return;

        const bodyFunction = (<FunctionExpression>lambda).declaration.body;

        if (bodyFunction === null) return;

        call.args[0] = Node.createIntegerLiteralExpression(i64_new(info.enumeration.length), string.range);

        info.enumeration.push((<StringLiteralExpression>string).value);
        const stmts = bodyFunction.kind === NodeKind.Block ? (<BlockStatement>bodyFunction).statements : [bodyFunction];

        for (let i = 0; i < stmts.length; i++) {
            const nstmt = stmts[i];
            if (nstmt !== null && isParseableCall(nstmt)) {
                traverseSuitesAndBenches(info, nstmt);
            }
        }
    }
}

// https://github.com/bheisler/criterion.rs/blob/970aa04aa5ee0514d1930c83a58c6ca994727567/src/lib.rs#L504
function parseSetting(parser: Parser, info: Info, ident: IdentifierExpression, val: Node): boolean {
    const name = ident.text;
    switch (name) {
        case "warmupTime": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this warmupTime is invalid.");
                return false;
            } else if (num <= 0) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "warmupTime must be greater than 0.");
                return false;
            }
            info.warmupTime = num;
            return true;
        }
        case "measurementTime": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this measurementTime is invalid.");
                return false;
            } else if (num <= 0) {
                parser.error(
                    DiagnosticCode.Transform_0_1,
                    val.range,
                    "as-tral",
                    "measurementTime must be greater than 0."
                );
                return false;
            }
            info.measurementTime = num;
            return true;
        }
        case "sampleSize": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this sampleSize is invalid.");
                return false;
            } else if (num < 10) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "sampleSize must be at least 10.");
                return false;
            }
            info.sampleSize = num;
            return true;
        }
        case "numResamples": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this numResamples is invalid.");
                return false;
            } else if (num < 1000) {
                parser.warning(
                    DiagnosticCode.Transform_0_1,
                    val.range,
                    "as-tral",
                    "Setting numResamples below 1000 is not recommended."
                );
                return false;
            }
            info.numResamples = num;
            return true;
        }
        case "samplingMode": {
            const mode = readString(val);
            switch (mode) {
                case "auto":
                    info.samplingMode = 0;
                    return true;
                case "linear":
                    info.samplingMode = 1;
                    return true;
                case "flat":
                    info.samplingMode = 2;
                    return true;
                default:
                    parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this samplingMode is invalid.");
            }
            return true;
        }
        case "confidenceLevel": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this confidenceLevel is invalid.");
                return false;
            } else if (num <= 0 || num >= 1) {
                parser.error(
                    DiagnosticCode.Transform_0_1,
                    val.range,
                    "as-tral",
                    "confidenceLevel must be between 0 and 1."
                );
                return false;
            } else if (num < 0.5) {
                parser.warning(
                    DiagnosticCode.Transform_0_1,
                    val.range,
                    "as-tral",
                    "Setting confidenceLevel below 0.5 is not recommended."
                );
            }
            info.confidenceLevel = num;
            return true;
        }
        case "significanceLevel": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this significanceLevel is invalid.");
                return false;
            } else if (num <= 0 || num >= 1) {
                parser.error(
                    DiagnosticCode.Transform_0_1,
                    val.range,
                    "as-tral",
                    "significanceLevel must be between 0 and 1."
                );
                return false;
            }
            info.significanceLevel = num;
            return true;
        }
        case "noiseThreshold": {
            const num = readNumberOrFloat(val);
            if (num === null) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "this noiseThreshold is invalid.");
                return false;
            } else if (num < 0) {
                parser.error(DiagnosticCode.Transform_0_1, val.range, "as-tral", "noiseThreshold must be at least 0.");
                return false;
            }
            info.noiseThreshold = num;
            return true;
        }
    }

    parser.error(DiagnosticCode.Transform_0_1, ident.range, "as-tral", `${name} is not a valid setting.`);
    return false;
}

export default Astral;
