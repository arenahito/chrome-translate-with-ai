# Translate with ChatGPT

A Chrome extension for translating text using your ChatGPT subscription. No API key, local companion app, or separate server is required.

## Installation

1. Download or copy the extension files to a local folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open the extension from the Chrome toolbar and click the login button.
6. Sign in to ChatGPT and authorize access to your ChatGPT plan.

## Translation

1. Enter or paste text into the left pane. The input limit is **50,000 characters**.
2. Leave the source language on automatic detection, or select a language.
3. Select the target language. Japanese offers polite and plain styles.
4. Click the translate button, or press **Ctrl+Enter** (**Cmd+Enter** on macOS).
5. Read the translation in the right pane, or use the copy button.

Typing does not start a translation. Use the stop button to cancel a translation in progress.

The swap button exchanges the source and target languages while keeping both texts. Swapping is unavailable when the source language is set to automatic detection.

## Settings

Open the gear menu to change:

- **Model:** Terra is selected by default. Available models depend on your ChatGPT account.
- **Reasoning level:** Low by default. Available levels depend on the selected model.
- **Appearance:** Light, dark, or system. The default follows your system appearance.
- **Display language:** English or Japanese. On first use, Japanese is selected if your browser language is Japanese; otherwise, English is selected. Your choice is saved.

Your selections are saved for the next session. Changing the source text, languages, model, or reasoning level requires a new translation; an existing result is marked as outdated.

## Sign-in and data

Sign-in information is encrypted and saved locally in your Chrome profile, so you can stay signed in after restarting Chrome. Use the logout button in the gear menu to sign out. If access expires or is revoked, sign in again.

Starting a translation sends the source text to OpenAI and uses your ChatGPT allowance. The extension does not save source text or translations as history, and does not switch to separately billed API access when your allowance is exhausted.

Uninstalling the extension removes its locally stored data.

Translate with ChatGPT is an independent project, not an official OpenAI product.
