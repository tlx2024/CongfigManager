// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
// 自检：node --experimental-strip-types frontend/scripts/diffLines.check.ts
import assert from 'node:assert';
import { diffLines } from '../src/lib/diffLines.ts';

const render = (o: string, n: string) =>
    diffLines(o, n)
        .map((d) => d.tag + d.text)
        .join('|');

assert.strictEqual(render('a\nb', 'a\nb'), ' a| b');
assert.strictEqual(render('a\nb', 'a\nx\nb'), ' a|+x| b');
assert.strictEqual(render('a\nx\nb', 'a\nb'), ' a|-x| b');
assert.strictEqual(render('a', 'b'), '-a|+b');
assert.strictEqual(render('', 'a'), '-|+a');

console.log('diffLines ok');
