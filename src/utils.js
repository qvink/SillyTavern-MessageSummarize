import { getContext, extension_settings } from '../../../../extensions.js';
import { debounce } from '../../../../script.js';
import { getStringHash } from '../../../../utils.js';
import { MODULE_NAME_FANCY } from './constants.js';
import { get_settings } from './settings.js';

export function log(message) {
    console.log(`[${MODULE_NAME_FANCY}]`, message);
}
export function debug(message) {
    if (get_settings('debug_mode')) {
        log("[DEBUG] "+message);
    }
}
export function error(message) {
    console.error(`[${MODULE_NAME_FANCY}]`, message);
    toastr.error(message, MODULE_NAME_FANCY);
}
export function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}
export function toast(message, type="info") {
    // debounce the toast messages
    toastr[type](message, MODULE_NAME_FANCY);
}
export const toast_debounced = debounce(toast, 500);

export const saveChatDebounced = debounce(() => getContext().saveChat(), 500);

export function count_tokens(text, padding = 0) {
    // count the number of tokens in a text
    let ctx = getContext();
    return ctx.getTokenCount(text, padding);
}

export function get_current_character_identifier() {
    // uniquely identify the current character
    // You have to use the character's avatar image path to uniquely identify them
    let context = getContext();

    // If a group, we can use the group ID to uniquely identify it
    if (context.groupId) {
        return context.groupId
    }

    // Otherwise get the avatar image path of the current character
    let index = context.characterId;
    if (!index) {  // not a character
        return null;
    }

    return context.characters[index].avatar;
}
export function get_current_chat_identifier() {
    // uniquely identify the current chat
    let context = getContext();
    return context.chatId

}
export function get_extension_directory() {
    // get the directory of the extension
    let index_path = new URL(import.meta.url).pathname
    return index_path.substring(0, index_path.lastIndexOf('/'))  // remove the /index.js from the path
}
export function clean_string_for_html(text) {
    // clean a given string for use in a div title.
    return text.replace(/["&'<>]/g, function(match) {
        switch (match) {
            case '"': return "&quot;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case "<": return "&lt;";
            case ">": return "&gt;";
        }
    })
    // return $('<div/>').text(text).html();
}
export function escape_string(text) {
    // escape control characters in the text
    if (!text) return text
    return text.replace(/[\x00-\x1F\x7F]/g, function(match) {
        // Escape control characters
        switch (match) {
          case '\n': return '\\n';
          case '\t': return '\\t';
          case '\r': return '\\r';
          case '\b': return '\\b';
          case '\f': return '\\f';
          default: return '\\x' + match.charCodeAt(0).toString(16).padStart(2, '0');
        }
    });
}
export function unescape_string(text) {
    // given a string with escaped characters, unescape them
    if (!text) return text
    return text.replace(/\\[ntrbf0x][0-9a-f]{2}|\\[ntrbf]/g, function(match) {
        switch (match) {
          case '\\n': return '\n';
          case '\\t': return '\t';
          case '\r': return '\\r';
          case '\b': return '\\b';
          case '\f': return '\\f';
          default: {
            // Handle escaped hexadecimal characters like \\xNN
            const hexMatch = match.match(/\\x([0-9a-f]{2})/i);
            if (hexMatch) {
              return String.fromCharCode(parseInt(hexMatch[1], 16));
            }
            return match; // Return as is if no match
          }
        }
    });
}
export function assign_and_prune(target, source) {
    // Modifies target in-place while also deleting any keys not in source
    let keys = Object.keys(target).concat(Object.keys(source))
    for (let key of keys) {
        if (!(key in source)) delete target[key];
        else target[key] = source[key];
    }
}
export function assign_defaults(target, source) {
    // Modifies target in-place, assigning values only when they don't exist in the target.
    for (let key of Object.keys(source)) {
        if (!(key in target)) target[key] = source[key];
    }
}
export function check_objects_different(obj_1, obj_2) {
    // check whether two objects are different by checking each key, recursively
    // if both are objects, recurse on each element of obj_1
    // The "instanceof" method is true for Objects, Arrays, and Sets.
    if (obj_1 instanceof Object && obj_2 instanceof Object) {
        let keys = Object.keys(obj_1).concat(Object.keys(obj_2))
        for (let key of keys) {
            if (check_objects_different(obj_1[key], obj_2[key])) {
                return true  // different
            }
        }
        return false  // not different
    } else {  // not both objects - check equality directly
        return obj_1 !== obj_2  // return if different
    }
}
export function regex(string, re) {
    // Returns an array of all matches in capturing groups
    let matches = [...string.matchAll(re)];
    return matches.flatMap(m => m.slice(1).filter(Boolean));
}

export function compare_semver(v1, v2){
    var v1p = v1.split('.');
    var v2p = v2.split('.');

    for (var i = 0; i < v1p.length; ++i) {
        if (v2p.length === i) {
            return 1;
        }
        if (v1p[i] === v2p[i]) {
            continue;
        }
        if (v1p[i] > v2p[i]) {
            return 1;
        }
        return -1;
    }
    if (v1.length !== v2.length) {
        return -1;
    }
    return 0;
}

export async function get_manifest() {
    const url = new URL(import.meta.url);
    const path = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    const response = await fetch(`${path}/../manifest.json`);
    return await response.json();
}

export function get_context_size() {
    return getContext().context_size;
}
