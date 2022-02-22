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

const inject = `
declare function now(): f64;
declare function result(descriptor: u32, time: f64): void;

const blackbox = memory.data(16);
export function bench<T>(descriptor: u32, routine: () => T): void {
	let start = now();
	for (let i = 0; i < 5000; i++) {
		store<T>(blackbox, routine());
	}
	result(descriptor, now() - start);
}
`;

class Astral extends Transform {
	afterParse(parser: Parser) {
		const enums = [];
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
							i64_new(enums.length),
							string.range
						);

						enums.push((<StringLiteralExpression>string).value);
					}
				}
			}
		}

		parser.parseFile(inject, "~lib/__astral__.ts", false);
	}
}

module.exports = Astral;
