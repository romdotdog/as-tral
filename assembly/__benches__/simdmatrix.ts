class Matrix4 {
    public elements: Float32Array = new Float32Array(16);
    constructor(
        m00: f32, m01: f32, m02: f32, m03: f32,
        m10: f32, m11: f32, m12: f32, m13: f32,
        m20: f32, m21: f32, m22: f32, m23: f32,
        m30: f32, m31: f32, m32: f32, m33: f32,
    ) {
        const te = this.elements;
        unchecked((te[0] = m00));
        unchecked((te[1] = m01));
        unchecked((te[2] = m02));
        unchecked((te[3] = m03));

        unchecked((te[4] = m10));
        unchecked((te[5] = m11));
        unchecked((te[6] = m12));
        unchecked((te[7] = m13));

        unchecked((te[8] = m20));
        unchecked((te[9] = m21));
        unchecked((te[10] = m22));
        unchecked((te[11] = m23));

        unchecked((te[12] = m30));
        unchecked((te[13] = m31));
        unchecked((te[14] = m32));
        unchecked((te[15] = m33));
    }

    multiplyScalar(s: f32): Matrix4 {
        const te = this.elements; // Float32Array

        unchecked((te[0] *= s));
        unchecked((te[4] *= s));
        unchecked((te[8] *= s));
        unchecked((te[12] *= s));
        unchecked((te[1] *= s));
        unchecked((te[5] *= s));
        unchecked((te[9] *= s));
        unchecked((te[13] *= s));
        unchecked((te[2] *= s));
        unchecked((te[6] *= s));
        unchecked((te[10] *= s));
        unchecked((te[14] *= s));
        unchecked((te[3] *= s));
        unchecked((te[7] *= s));
        unchecked((te[11] *= s));
        unchecked((te[15] *= s));

        return this;
    }

    multiplyScalarSIMD(s: f32): Matrix4 {
        const te = this.elements.dataStart;  // Float32Array
        const scalar = f32x4.splat(s);
        const a0 = f32x4.mul(v128.load(te, 0), scalar);
        const a1 = f32x4.mul(v128.load(te, 16), scalar);
        const a2 = f32x4.mul(v128.load(te, 32), scalar);
        const a3 = f32x4.mul(v128.load(te, 48), scalar);
        v128.store(te, a0, 0);
        v128.store(te, a1, 16);
        v128.store(te, a2, 32);
        v128.store(te, a3, 48);
        return this;
    }
}


const _matrices: Matrix4[] = [];

for (let i = 0; i < 100; ++i) {
    _matrices.push(new Matrix4(
        (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32,
        (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32,
        (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32,
        (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32, (Math.random() * 100 - 50) as f32
    ));
}

bench("mat4", () => {
    for (let i = 0; i < numMatrices; ++i) {
        const m = unchecked(_matrices[i]);
        m.multiplyScalar(5);
    }
})

const numMatrices = _matrices.length;
bench("simd mat4", () => {
    for (let i = 0; i < numMatrices; ++i) {
        const m = unchecked(_matrices[i]);
        m.multiplyScalarSIMD(5);
    }
})