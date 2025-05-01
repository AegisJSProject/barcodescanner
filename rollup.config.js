import terser from '@rollup/plugin-terser';

export default [{
	input: 'scanner.js',
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
