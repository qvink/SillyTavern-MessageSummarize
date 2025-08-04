import { getContext } from '../../../extensions.js';
import { createRawPrompt, generateRaw, streamingProcessor } from '../../../../script.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js';
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js';
import { get_settings } from './settings.js';
import { debug } from './utils.js';

export async function generate_summary(message_text) {
    const prompt = get_settings('prompt');
    const preset = get_settings('completion_preset');
    const connection = get_settings('connection_profile');

    const raw_prompt = await createRawPrompt(
        prompt,
        extension_prompt_types.IN_PROMPT,
        getContext(),
        message_text,
        null,
        null,
        null,
        null,
        preset,
        connection
    );

    let summary = '';
    await generateRaw(
        raw_prompt,
        (chunk) => { summary += chunk; },
        false,
        preset,
        connection
    );

    return summary.trim();
}

export function regex(string, re) {
    let matches = [...string.matchAll(re)];
    return matches.flatMap(m => m.slice(1).filter(Boolean));
}

export function get_regex_script(name) {
    const scripts = getRegexScripts();
    for (let script of scripts) {
        if (script.scriptName === name) {
            return script;
        }
    }
    debug(`No regex script found: "${name}"`);
    return null;
}
