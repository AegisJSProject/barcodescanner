import {
	useDefaultCSP, addConnectSrc, addScriptSrc, addStyleSrc, addPrefetchSrc, addTrustedTypePolicy,
	WASM_UNSAFE_EVAL, lockCSP,
} from '@aegisjsproject/http-utils/csp';
import { RXING_WASM, RXING_WASM_BG, RXING_WASM_BG_INTEGRITY, RXING_WASM_INTEGRITY } from './rxing.js';
import { Importmap } from '@shgysk8zer0/importmap';

const importmap = new Importmap();
await importmap.importLocalPackage();

addScriptSrc(
	'https://unpkg.com/@aegisjsproject/',
	'https://unpkg.com/@shgysk8zer0/',
	RXING_WASM_BG,
	RXING_WASM_BG_INTEGRITY,
	WASM_UNSAFE_EVAL,
);

addStyleSrc(importmap.resolve('@aegisjsproject/styles/css/'));

addPrefetchSrc(RXING_WASM_BG, RXING_WASM);
addConnectSrc(
	RXING_WASM,
	RXING_WASM_INTEGRITY,
);
addTrustedTypePolicy('aegis-sanitizer#html');
lockCSP();

export default {
	pathname: '/',
	port: 8182,
	open: true,
	routes: {
		'/': '@aegisjsproject/dev-server/home',
		'/favicon.svg': '@aegisjsproject/dev-server/favicon',
	},
	responsePostprocessors: [useDefaultCSP()]
};
