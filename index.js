import { createBarcodeScanner, preloadRxing } from '@aegisjsproject/barcodescanner/scanner.js';
import { reset } from '@aegisjsproject/styles/reset.js';
import { baseTheme, lightTheme, darkTheme } from '@aegisjsproject/styles/theme.js';
import { btn, btnPrimary, btnDanger } from '@aegisjsproject/styles/button.js';

document.adoptedStyleSheets = [reset, baseTheme, lightTheme, darkTheme, btn, btnPrimary, btnDanger];

preloadRxing();

function start() {
	const controller = new AbortController();
	const signal = controller.signal;
	const btn = document.getElementById('stop');

	createBarcodeScanner(({ rawValue, format }) => {
		const li = document.createElement('li');
		li.textContent = `[${format}] ${rawValue}`;
		document.getElementById('results').append(li);
	}, { frameRate: 24, signal, video: 'scanner', chimeType: 'sawtooth', chimeFrequency: 4000, chimeDuration: 0.1 }).catch(err => {
		controller.abort(err);
		reportError(err);
		const li = document.createElement('li');
		li.textContent = err.message;
		document.getElementById('results').append(li);
	});

	btn.addEventListener('click', ({ currentTarget }) => {
		controller.abort();
		currentTarget.disabled = true;
		document.getElementById('start').disabled = false;
	}, { once: true, signal });

	btn.disabled = false;
}

document.getElementById('start').addEventListener('click', ({ currentTarget }) => {
	start();
	currentTarget.disabled = true;
});
