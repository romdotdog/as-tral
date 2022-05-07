import { argv, exit } from "process";

interface Flags {
    baseline?: string,
    saveBaseline?: string
}

enum State {
    Default,
    Baseline,
    SaveBaseline
}

const transition = new Map([
    ["--baseline", State.Baseline],
    ["--save-baseline", State.SaveBaseline]
])

let i = 2;
for (; i < argv.length; ++i) {
    if (argv[i] == "--") {
        break;
    }
}

const asFlags = argv.slice(2, i);
const flags: Flags = {}

let state = State.Default;
main: while (true) {
    switch (state) {
        case State.Default: {
            if (++i >= argv.length) {
                break main;
            }

            const flag = argv[i];
            const newState = transition.get(flag);
            if (newState === undefined) {
                console.log("ERROR: unknown flag " + flag);
                exit(1);
            }

            state = newState;
            break;
        }
        case State.Baseline: {
            if (i >= argv.length) {
                console.log("ERROR: expected argument after --baseline");
                break main;
            }

            flags.baseline = argv[++i];
            state = State.Default;
            break;
        }
        case State.SaveBaseline: {
            if (i >= argv.length) {
                console.log("ERROR: expected argument after --save-baseline");
                break main;
            }

            flags.saveBaseline = argv[++i];
            state = State.Default;
            break;
        }
    }
}

export { asFlags, flags };
