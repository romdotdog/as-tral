import { Transform } from "assemblyscript/cli/transform";
import {
	Node,
	NodeKind,
	Parser,
	CallExpression,
	ExpressionStatement,
	IdentifierExpression,
	LiteralExpression,
	LiteralKind,
	StringLiteralExpression
} from "assemblyscript";

import { join } from "path";
import { readFileSync } from "fs";

const lib = readFileSync(join(__dirname, "../assembly/main.ts"), {
	encoding: "utf8"
});
const encoder = new TextEncoder();
class Astral extends Transform {
	afterParse(parser: Parser) {
		const info: Info = { enumeration: [] };
		for (const src of parser.sources) {
			if (src.isLibrary) continue;
			const range = src.statements[0]!.range;
			const imp = Node.createImportStatement(
				[
					Node.createImportDeclaration(
						Node.createIdentifierExpression("bench", range),
						null,
						range
					)
				],
				Node.createStringLiteralExpression("__astral__", range),
				range
			);

			src.statements.unshift(imp);
			for (const stmt of src.statements) {
				if (stmt.kind == NodeKind.EXPRESSION) {
					const expr = (<ExpressionStatement>stmt).expression;
					if (expr.kind == NodeKind.CALL) {
						const call = <CallExpression>expr;
						if (
							call.expression.kind != NodeKind.IDENTIFIER ||
							(<IdentifierExpression>call.expression).text != "bench" ||
							call.args.length != 2
						)
							continue;

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
					}
				}
			}
		}

		parser.parseFile(lib, "~lib/__astral__.ts", false);
		this.writeFile("__astralinfo__", encoder.encode(JSON.stringify(info)), ".");
	}
}

module.exports = Astral;
