import { imports } from '@shgysk8zer0/importmap';

const importmap = JSON.stringify({ imports });
const integrity = 'sha384-' + await crypto.subtle.digest('SHA-384', new TextEncoder().encode(importmap))
	.then(hash => new Uint8Array(hash).toBase64());

const doc = `<!DOCTYPE html>
<html lang="en" dir="ltr">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width" />
		<meta name="color-scheme" content="light dark" />
		<title>Test Page</title>
		<script type="importmap" integrity="${integrity}">${importmap}</script>
		<script type="application/javascript" defer="" referrerpolicy="no-referrer" fetchpriority="high" crossorigin="anonymous" integrity="sha384-X8d55dt38lBIY87GNkg6Upb9pjtwYlhEoKtw9Sfsbj/XCDV4W+g0kdx4X1Bo/EaO" src="https://unpkg.com/@shgysk8zer0/polyfills@0.4.11/browser.min.js"></script>
		<script type="module" src="/index.js" referrerpolicy="no-referrer"></script>
	</head>
	<head>
		<h1>Results</h1>
		<ul id="results"></ul>
	</head>
</html>`;

const csp = `default-src 'self';
script-src 'self' https://unpkg.com/@aegisjsproject/ https://unpkg.com/@shgysk8zer0/ https://unpkg.com/rxing-wasm@0.3.6/rxing_wasm_bg.js 'wasm-unsafe-eval' '${integrity}';
style-src 'self' blob:;
connect-src 'self' https://unpkg.com/rxing-wasm@0.3.6/rxing_wasm_bg.wasm;
require-trusted-types-for 'script';
`.replaceAll('\n', '');

export default {
	pathname: '/',
	open: true,
	routes: {
		'/': () => {
			return new Response(doc, {
				headers: {
					'Content-Type': 'text/html',
					'Content-Security-Policy': csp,
				}
			});
		}
	},
};
