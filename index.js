import { createBarcodeScanner, preloadRxing } from '@aegisjsproject/barcodescanner/scanner.js';
import reset from '@aegisjsproject/styles/css/reset.css' with { type: 'css' };
import theme from '@aegisjsproject/styles/css/theme.css' with { type: 'css' };
import btn from '@aegisjsproject/styles/css/button.css' with { type: 'css' };

document.adoptedStyleSheets = [reset, theme, btn];

preloadRxing();

async function start() {
	const btn = document.getElementById('stop');
	const stack = new DisposableStack();

	createBarcodeScanner(({ rawValue, format }) => {
		const li = document.createElement('li');
		li.textContent = `[${format}] ${rawValue}`;
		document.getElementById('results').append(li);
	}, { frameRate: 24, video: 'scanner', chimeType: 'sawtooth', chimeFrequency: 4000, chimeDuration: 0.1, stack }).catch(err => {
		stack.disposeAsync();
		reportError(err);
		const li = document.createElement('li');
		li.textContent = err.message;
		document.getElementById('results').append(li);
	});

	btn.addEventListener('click', ({ currentTarget }) => {
		stack.dispose();
		currentTarget.disabled = true;
		document.getElementById('start').disabled = false;
	}, { once: true });

	btn.disabled = false;
}

document.getElementById('start').addEventListener('click', ({ currentTarget }) => {
	start();
	currentTarget.disabled = true;
});
