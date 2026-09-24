// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        strictPort: true
    }
});
