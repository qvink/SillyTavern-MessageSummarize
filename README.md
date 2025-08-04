### Contents
- [Quick Start](#quick-start)
- [Description](#description)
- [Motivation](#motivation)
- [Notable Features](#notable-features)
- [Installation and Basic Usage](#installation-and-basic-usage)
- [Advanced Usage](#advanced-usage)
- [Slash Commands](#slash-commands)
- [Custom CSS](#custom-css)
- [Tips & Tricks](#tips--tricks)
- [Troubleshooting](#troubleshooting)
- [Reporting an Issue](#reporting-an-issue)
- [Known Issues](#known-issues)


### Quick Start

1.  **Installation:** In SillyTavern, go to the extensions panel and install using this repository's URL: `https://github.com/s0ulgu1tar/ST-MessageSummarize-v2.git`
2.  **Enable:** The extension is enabled by default for new chats. You can toggle it for the current chat using the "Toggle Memory" button in the extension's settings panel.
3.  **Usage:**
    *   Messages are automatically summarized based on the default settings.
    *   To mark a message for long-term memory, click the "brain" icon on the message.
    *   Customize summarization behavior in the settings panel.

### Description
- This extension is an alternative to the built-in `Summarize` extension, reworking how memory is stored by summarizing each message individually, rather than all at once.
- Summaries are injected into the main prompt at two levels: `short-term` memory and `long-term` memory.
- `Short-Term` memory rotates out the most recent message summaries automatically.
- `Long-Term` memory stores summaries of **manually-marked** messages beyond the short-term limit.

### Motivation
The built-in `Summarize` extension has several problems:
- Summarizing the whole chat all at once is prone to inaccuracies and missing details.
- Letting an LLM determine how to update the chat summary means that it will degrade over time, and one bad generation can completely ruin it.
- Modifying the chat doesn't necessarily affect the summary (because again, it's handled by an LLM).
- No reliable way to keep recent memories more relevant or differentiate from long-term memories.
- Letting the LLM decide what long-term memories to keep may not align with that you want.

How this extension addresses these issues:
- Summarizing messages individually (as opposed to all at once) gets more accurate summaries and is less likely to miss details.
- Summaries don't degrade over time because memory storage is not handled by an LLM.
- Each summary is attached to the message it summarizes, so editing/deleting a message only affects the associated memory.
- Short-term memory guarantees that relevant info is always available from the most recent messages, but goes away once no longer relevant according to a set limit.
- Long-term memory allows you to choose which messages are important to remember, keeping them available for longer (up to a separate limit).

### Notable Features
- **Configuration profiles:** save and load different configurations profiles and set one to be auto-loaded for each character, group, or chat.
- **Separate Completion Preset / Connection Profile**: Choose one of your completion presets and connection profiles to be used for summaries.
- **Popout config menu:** customize summarization settings, injection settings, and auto-summarization message inclusion criteria.
- **Compact Interface:** A separate popout interface for viewing and editing all memories in your chat.
- **Save Context:** Optionally remove full messages from your context that have been summarized to reduce token usage.
- **Unobtrusive Display:** Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.
  - Grey: Excluded

### Installation and Basic Usage
- Install the extension in SillyTavern using this repository's URL: `https://github.com/s0ulgu1tar/ST-MessageSummarize-v2.git`
- To mark a message for long-term memory, click the "brain" icon in the message button menu.
- To re-summarize a message, click the "Quote" icon in the message button menu.
- To edit a summary, click on the summary text directly or click the "pen" icon in the message button menu.
- To only summarize certain characters in a group chat, open the group chat edit menu and scroll down to the member list. Click the glowing "brain" icon to toggle whether that character will be automatically summarized (if you have auto-summarization enabled).
- If you want to know what any particular configuration setting does, hover over it and read the tooltip.

### Advanced Usage
- This extension has extensive configuration settings that control its function, separated into the sections listed below.
- To toggle whether the extension is active in the current chat, click the `Toggle Memory` button at the top.
- To perform actions on multiple summaries at once, click the `Edit Memory` button at the top. Here you can filter for specific memories or manually select memories to modify.

#### Configuration Profiles
- This extension allows you to create configuration profiles that can be set to active for specific characters or specific chats.
- Config profiles don't save automatically, you must click the `save` icon for any changes to be stored permanently.
- You can also restore a profile to its last saved state by clicking the `restore` icon.

#### Summarization:
- This section of the config menu is where you control how your messages are summarized.
- Click the `Edit` button to bring up a popup that allows you to edit the summarization prompt itself, along with custom macros that will insert messages from your chat. Here you can also change the role used for the prompt as well as a response prefill.
- You can also set a separate `Connection Profile` or `Completion Preset` to be used specifically for summarizations. Note that due to a limitation of ST (ST can only have one connection and preset active at a time), when summaries occur the extension switches to that connection profile and completion preset until summarization is complete. This means that, if you have unsaved changes to your connection profile or completion preset, they will be lost when summarization occurs.
- You can control whether messages get re-summarized when they are edited, swiped, or continued.
- If you are using a cloud model with an API request limit, you can also set a `Time Delay` between summaries.

#### Auto-Summarization
- Here you can control how often your messages are automatically summarized, if at all. By default, summarizations will occur automatically right after a message is sent in the chat. The extension will go back in your chat and look for any messages that need to be summarized, following certain criteria (see the [Short-Term Memory Injection](#short-term-memory-injection) section). 
- If you instead want previous messages to be summarized right *before* a new one is sent, choose `Before Generation`
- The `Message Lag` setting will make auto-summarization lag behind by the specified number of messages, useful if you only want things summarized once they've been in the chat for a while.
- The `Batch Size` setting will wait the specified number of messages before summarizing all of them in sequence (they are still summarized individually).
- The `Message Limit` setting will set an upper limit to how many messages to look backward in the chat when auto-summarizing.

#### General Injection Settings
- This controls how summaries are injected into your context (applies to both `short-term` and `long-term`)
- Here the `Start Injecting After` setting controls how many messages to wait before summaries even start to be injected into your context.
- You can then optionally remove the original messages associated with those summaries from your context to free up space by selecting `Remove Messages After Threshold`.
- By default, all summaries will be included in `short-term` memory until they exceed the context limit, at which point they will be put into `long-term` memory if you have manually marked them as such. If instead you enable `Static Memory Mode`, marked summaries will instead always be put in `long-term` memory regardless of context. Be aware that this may put memories out of chronological order.

#### Short-Term Memory Injection
- These settings affect how `short-term` summaries are injected.
- Note that the inclusion criteria from this section will also determine which messages are `auto-summarized`.
- By default, messages from the character are included in short-term memory, but you can choose to include `User` messages, `Hidden` messages, and `System` messages.
- The `Message Length Threshold` determines how long a message has to be in order to summarize it (in tokens).
- The `Context` determines how many tokens in your context all `short-term` summaries are allowed to take up. Once older summaries exceed this limit, they are either discarded or moved into `long-term` memory.
- You can also select where in your context to inject `short-term` summaries, or choose not to inject them at all (in which case you would need to use the `{{qm-short-term-memory}}` macro to manually put them into your context).

#### Long-Term Memory Injection
- These settings affect how `long-term` summaries are injected.
- Because `long-term` summaries are manually selected, there is no automatic inclusion criteria.
- The `Context` determines how many tokens in your context all `long-term` summaries are allowed to take up. Once older summaries exceed this limit, they are removed from context completely.
- You can also select where in your context to inject `long-term` summaries, or choose not to inject them at all (in which case you would need to use the `{{qm-long-term-memory}}` to manually put them into your context).

#### Misc.
- This section contains a few miscellaneous settings.
- `Debug Mode` cause the extension to output additional logs in your browser console, useful for reporting bugs.
- `Display Memories` toggles whether memories are displayed in small text below each message in the chat.
- `Enable Memory in New Chats` toggles whether the extension will be enabled when you create a new chat.
- `Use Global Toggle State` will make all configuration profiles that have this option enabled share an on/off state. If this is enabled, toggling the extension on/off will do the same for any configuration profile that also has this option enabled. If this is disabled, then toggling the extension will only apply for the currently selected profile.


### Slash Commands
Note: all commands have `/qvink-memory-` as an alias.
- `/qm-enabled`: Returns whether the extension is enabled in the current chat.
- `/qm-toggle`: Toggles the extension on and off for the current chat. Same as clicking "Toggle Chat Memory" in the config. Can also provide a boolean argument to toggle the extension directly.
- `/qm-toggle-display`: Toggles the display of summaries below each message. Same as toggling the "Display Memories" setting in the config.
- `/qm-toggle-auto-summarize`: Toggle whether auto-summarize is enabled. Same as toggling the "Auto-Summarize" setting in the config. 
- `/qm-toggle-config`: Toggles the popout config menu.
- `/qm-toggle-edit-interface`: Toggles the "Edit Memory" interface
- `/qm-toggle-injection-preview`: Toggles a preview of the text that will be injected
- `/qm-toggle-remember`: Mark a given message index for long-term memory, summarizing it if not already. Same as clicking the "Brain" icon in the message button menu.
- `/qm-toggle-exclude`: Toggles the manual exclusion of the memory for the given message index. Same as clicking the "Force Exclude" button in the message button menu.
- `/qm-get`: Get the memory associated with a message or range of messages. Defaults to the most recent message.
- `/qm-set`: Set the memory associated with a message to the given text.
- `/qm-summarize`: Summarizes the nth message in the chat (default to most recent message). Same as clicking the "Quote" icon in the message button menu.
- `/qm-summarize-chat`: Performs a single auto-summarization on the chat, even if auto-summarization is disabled. This takes into account the auto-summarization inclusion criteria and message limit.
- `/qm-stop-summarization`: stops any sequence of summarizations currently running. Same as clicking the "stop" button in the config or next to the progress bar.
- `/qm-max-summary-tokens`: Get the max response tokens defined in the current completion preset used for summaries.


### Custom CSS
You can easily customize the CSS for displayed memories by setting the following variables:
- `--qm-short`: Summaries in short-term memory (default green)
- `--qm-long`: Summaries in long-term memory (default blue)
- `--qm-old`: Summaries marked for long-term memory, but now out of context (default red)
- `--qm-default`: Summaries not included in any memory (default light grey)
- `--qm-excluded`: Summaries manually force-excluded (default dark grey)
- `--qm-message-removed`: Messages that have been removed from context and replaced by summaries (default light grey)

Just make sure to use the `!important` directive to override the default styles.
For example, to color short-term memories yellow and long-term memories black, you would put the following in your "Custom CSS" user settings:
```
:root {
   --qm-short: yellow !important;
   --qm-long: black !important;
}
```

### Tips & Tricks
Each model is different of course, but here are just some general things that I have found help getting clean summarizations.
Try them out if you want.

- **Keep it simple**: Longer summary prompts tend to muddy the waters and get less accurate results. Just in general LLMs have trouble with information overload (hence the reason for this extension in the first place).


- **Low temperature**: I like to use a temp of 0 to reduce creativity and just get down to the facts. No need for flowery language.


- **No repetition penalty**: Again, no need for creativity, in fact I want it to repeat what happened.


- **The `{{words}}` macro doesn't always help**: While some models may reign themselves in if you tell them to keep it under X words, LLMs don't have a soul and therefore can't count, so don't bet on it.


- **You can use global macros**: If your summaries aren't using names properly, keep in mind that you can use the `{{char}}` or `{{user}}` macro in the prompt.


- **No need to pause roleplay**: You don't have to include anything like "ignore previous instructions" or "pause your roleplay". The summary prompt is completely independent and will only send what you see in the edit window.


- **I don't recommend reasoning**: Reasoning models can summarize fine, but they do tend to blab for ages which makes summarizing slow, so I wouldn't recommend them for that reason. If you do use one, make sure to use the appropriate prefill in your summarization prompt, and set the thinking formatting in your `Advanced Formatting` tab.


- **Custom Macros**: In the `Edit` window for your summary prompt, you can create custom macros to use in your prompt with STScript. In your command, you can reference the ID of the message being summarized with `{{id}}` and the content of the message with `{{message}}`.


- **Save your presets**: If you are using a different completion preset or connection profile for summaries, make sure to save any changes to your regular completion preset or instruct template. When summarizing, the extension has to temporarily switch presets or connection profiles, which will discard any unsaved changes to the one you are currently using.


- **Cloud Models are Picky**: Cloud APIs tend to have strict rules about how their prompts are constructed, so you may need to adjust things when creating your prompt. For example, some models have heavy filters enabled for `User` roles messages, and may work better with `System` messages. Some cloud models don't support `System` messages at all, so you would need to use `User`. You will need to experiment, or read up on what your particular cloud model expects.


### Troubleshooting:

- **Summaries seem to be continuing the conversation rather than summarizing:** probably an issue with your instruct template (text completion).
Make sure you are using the correct template for your model, and make sure that system messages are properly distinct from user messages.
This can be caused by the "System same as user" checkbox in your instruct template settings, which will cause all system messages to be treated like a user - uncheck that if your model can handle it. 
Some default instruct templates also may not have anything defined for the "System message sequences" field - that should be filled out. If all else fails, you can also change the role of the summarization prompt in the prompt `Edit` interface (some cloud models don't have system messages).


- **The summaries refer to "a person" or "someone" rather than the character by name:** Try using the `{{user}}` or `{{char}}` macros in the summary prompt. There is also a `{{history}}` macro to use that can add a few previous messages in the summarization prompt to give the model a little more context. 


- **The summaries are too long:** You can select a custom completion preset in the settings to use for summarizations, and that can be used to set a maximum token length after which generation will be cut off. You can also use the `{{words}}` macro in the summarization prompt to try and guide the LLM according to that token length, though LLMs cannot actually count words so it's really just a suggestion.


- **Reasoning model won't do any reasoning**: Some reasoning models need to be prefilled, so make sure to add that in the `Prefill` field of the summary prompt `Edit` interface (**NOT** the normal "start reply with" field in the Advanced Formatting tab).


- **Reasoning model thinking is included in summary**: In the `Advanced Formatting` tab, make sure to fill in the thinking tags (e.g. `<think>` and `</think>` for DeepSeek R1). This will let the extension identify the thinking section in memories and parse them separately.


- **Chat Completion API behaving strangely (errors, hallucinating, etc):** If you are using a cloud API, it might have specific requirements about how it expects prompts to be sent.
  - Some cloud models don't support a `System` role for prompts, so you would need to use the `User` role in the summary prompt `Edit` interface.
  - Some cloud models don't accept prompts that end in an assistant message, so if the prompt ends with the `{{message}}` macro, you would need to disable the `Separate Block` checkbox in the `{{message}}` macro. This makes it so that the message to summarize is not sent separately, but rather as part of the prompt message itself.
  - Some cloud models need more than one message to be sent. To accomplish this, you could make a custom STScript macro, put it at the top of your prompt, and check the `Separate Block` checkbox to make it a separate message.



- **Incomplete sentences aren't getting trimmed even though the option is checked in the advanced formatting settings:** If you are using a different connection profile for summaries, note that instruction templates are part of that so the option needs to be checked in the templated used for that connection profile.


- **My jailbreak isn't working:** You'll need to put a jailbreak in the summarization prompt if you want it to be included.


- **Just updated and things are broken:** try reloading the page first, and make sure you are on the most recent version of ST. If you are on the dev branch of this extension, you must also be on the staging branch of ST.


- **When I use a different completion preset for summaries, my regular completion preset get changed after summarizing:** When a summary is generated, we actually have to switch completion presets temporarily which discards any unsaved changes you might have made to your current completion preset. This is just how ST does things. The same applies to connection profiles (which in turn affects instruction templates.)


- **An unknown error occurred while counting tokens**: This might indicate an issue with your custom chat completion preset. ST expects there to be a prompt section called "main", which is where extension injections go by default. If your preset doesn't have a section called "main", this will fail and cause the above error. To fix this, you can (1) add a section called "main" to your preset or (2) go to this extension's config menu and click "Do not inject" in both the short-term and long-term injection sections. This will prevent the extension from attempting to insert context, and you can instead use the `{{short_term_memory}}` and `{{long_term_memory}}` macros to place them anywhere you want.


- **"ForbiddenError: invalid csrf token":** You opened ST in multiple tabs.


- **"Syntax Error: No number after minus sign in JSON at position X":** update your koboldcpp, or try disabling "Request token probabilities".


- **"min new tokens must be in (0, max_new_tokens(X)], got Y":** your model has a minimum token amount, which is conflicting with the max tokens you are using for summarization. Either reduce the minimum token amount for your model (usually in the completion settings), or increase the maximum token length for summarizations.


### Reporting an Issue
You can raise an issue here, but I am more responsive on the SillyTavern [Discord server](https://discord.gg/sillytavern) as Qvink (#qvink1). There you will find [forum thread](https://discord.com/channels/1100685673633153084/1318109682329587722) dedicated to this extension (and others).

When you report an issue, please include the following information:
1. Your SillyTavern version + branch
2. Your extension version + branch
3. Description of the bug
4. Detailed steps to reproduce the bug in a **minimal environment** (new chat, default config, no other extensions)
5. Any errors in the browser console or ST terminal (you can access your browser console with F12)

The best way to help identify a bug is to help me reproduce it. Simply saying "X doesn't work" is unhelpful. Ideally, the steps you provide in #4 above should start with creating a new, blank chat and using default settings for the extension. You can revert settings to default by scrolling to the bottom of the config and clicking `Revert Settings`.

### Known Issues
- When editing a message that already has a memory, the memory displayed below the message does not have the right color. This is just a visual bug, and it will correct itself after the next summarization.
- Using the API tokenizer may cause lag when opening chats under certain circumstances, cause currently unknown.

### Todo
- ~~Ability to choose a connection profile for summarization~~
- ~~Remove disabled group members from context~~
- ~~Option to use a global toggle state for chats~~
- ~~Fix reported freezing issue for chats with 30k+ messages~~
- ~~Add button to force-exclude a summary from memory~~
- ~~Add slash command to return state of the extension and toggle it on and off~~
- ~~Allow setting a number of tokens for context sizes directly.~~
- ~~Slash command to retrieve a memory by index~~
- ~~Handle swiping, editing, and deleting summaries~~
- ~~button to re-summarize a given message~~
- ~~Display summaries below each message~~
- ~~config profiles, and allow character-specific settings to be saved~~
- ~~ability to stop summarization at any time~~
- ~~Added ability to provide global macros in summarization prompt~~
- ~~Added the ability to choose whether to nest the messages in the summarization prompt or not~~
- ~~Added the ability to toggle automatic summarization on message edit and swipe/regenerate~~
- ~~Added summarization delay option~~
- ~~Fix issue that is sometimes inadvertently changing the completion config max tokens when reloading for some reason???~~
  - ~~Turns out to be an issue with ST. Issue raised [here](https://github.com/SillyTavern/SillyTavern/issues/3297#issue-2782705578)~~
  - ~~potential fix merged into staging branch [here](https://github.com/SillyTavern/SillyTavern/pull/3301).~~
- ~~Fix issue causing the popout to bug out when pressing escape.~~
- ~~Figure out how to limit the number of regular chat messages injected into the prompt so they can be replaced by the summaries.~~
- ~~Move the prompt editing text areas to separate modals~~
- ~~support group chats~~
- ~~Add macro for max words to use in the summary prompt~~
- ~~Set the frequency at which automatic summarizations occur (e.g. every X messages)~~
- ~~Allow disabling extension in individual chats without giving it a profile.~~
- ~~Add option to include a few previous messages/summaries in the summary prompt as context~~
- ~~Progress bar for summarization~~
- ~~Add option to select which characters are summarized in a group~~
- ~~Add slash command to toggle popout~~
- ~~Add slash command to stop summarization~~
- ~~Add a delay option to slow down summarization (to handle rate limits for external APIs)~~
- ~~Maybe add an option to use different completion presets for the summarization.~~
- ~~Need to detect when more messages are loaded into the chat via the "load more message" button, and update the message visuals to display any memories on them. Annoyingly, no event seems to be fired when the chat updates this way (that I could find).~~
  - ~~PR for event that triggers when more messages are loaded [here](https://github.com/SillyTavern/SillyTavern/pull/3331#issue-2803412920)~~
- ~~Ability to turn off summaries being displayed, but still view them on a given message.~~
- ~~Ability to modify memory directly without visiting each message~~
- ~~Add option for summary prefill~~
- ~~Sentence trimming for summaries.~~
- ~~fix using is_system instead of extra.type === system_message_types.NARRATOR~~
- ~~Allow customizing the memory injection separators~~
- ~~Allow locking profile to specific chat, not just character.~~
- ~~import/export profiles~~
- ~~Option to remove redundant memory injections while the associated messages are in context.~~
- ~~Make the memory injections global macros~~
- ~~Fix message limit messing with world info timed effects. PR: https://github.com/SillyTavern/SillyTavern/pull/3763#issue-2948421833~~
- ~~Format injections as system prompt~~
- ~~Add dashed line to memory edit interface~~
- ~~detect response length change to update settings visuals~~
- ~~apply optional regex to messages~~
- ~~Reworded summary prompt interface~~
- ~~Add the time delay before the initial summarization where appropriate~~
- ~~fix prefill compatability with chat completion (generate_raw doesn't allow adding separate messages in chat completion)~~
- ~~Re-summarize on continue~~
- ~~Render markdown in summaries~~
- ST PR to provide custom start/end strings to parseReasoningFromString(), and allow memories to be parsed any time. Should the reasoning format just be separate from the advanced formatting template?
