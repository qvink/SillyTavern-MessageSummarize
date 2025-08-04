import { MODULE_NAME } from './src/constants.js';

async function initialize() {
    try {
        // Dynamically import the main module to start the extension
        const main = await import('./src/main.js');
        // The main module should export an 'initialize' function
        if (main.initialize && typeof main.initialize === 'function') {
            main.initialize();
            console.log('Message Summarize v2 initialized successfully.');
        } else {
            console.error('Failed to initialize Message Summarize v2: initialize function not found in main.js.');
        }
    } catch (e) {
        console.error('Failed to load or initialize Message Summarize v2:', e);
    }
}

// This is a common pattern for SillyTavern extensions.
// We wait for the DOM to be fully loaded before we try to initialize our extension.
$(document).ready(function () {
    // A short delay can sometimes help ensure that all other scripts have loaded
    setTimeout(initialize, 100);
});

export { MODULE_NAME };
