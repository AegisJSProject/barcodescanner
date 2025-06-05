import terser from '@rollup/plugin-terser';

export default [{
	input: 'scanner.js',
	external: [
		'https://unpkg.com/rxing-wasm@0.3.6/rxing_wasm_bg.js',
	],
	output: [{
		file: 'scanner.cjs',
		format: 'cjs',
	}, {
		file: 'scanner.min.js',
		format: 'esm',
		plugins: [terser()],
		sourcemap: true,
	}],
}];
