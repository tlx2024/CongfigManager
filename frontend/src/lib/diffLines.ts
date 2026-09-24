// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
export type DiffLine = { tag: ' ' | '-' | '+'; text: string };

/**
 * 逐行 LCS diff。'-' 来自左侧（旧），'+' 来自右侧（新），' ' 是两边相同的行。
 * ponytail: O(n*m) DP，schema 文件几百行以内够用；真要 diff 大文件再换 Myers。
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
    const a = oldText.split('\n');
    const b = newText.split('\n');
    const n = a.length;
    const m = b.length;

    // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            out.push({ tag: ' ', text: a[i] });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ tag: '-', text: a[i] });
            i++;
        } else {
            out.push({ tag: '+', text: b[j] });
            j++;
        }
    }
    while (i < n) out.push({ tag: '-', text: a[i++] });
    while (j < m) out.push({ tag: '+', text: b[j++] });
    return out;
}
