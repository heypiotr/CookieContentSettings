import { api as _api } from "./api"

// Update status on each API call.
const api: typeof _api = (...args) => _api(...args).finally(() => updateStatus())

function updateStatus() {
    const lastError = chrome.runtime.lastError
    if (lastError) {
        console.error(lastError.message)
        ui.statusText.textContent = lastError.message || "Unknown error"
    } else {
        ui.statusText.textContent = ""
    }
}

const ui = {
    statusText: document.getElementById("status-text")!,

    addForm: document.getElementById("add-form")!,
    primaryPatternInput: document.getElementById("primary-pattern-input")! as HTMLInputElement,
    secondaryPatternInput: document.getElementById("secondary-pattern-input")! as HTMLInputElement,
    settingDropdown: document.getElementById("setting-select")! as HTMLSelectElement,

    setAllButton: document.getElementById("set-all-btn")!,
    clearAllButton: document.getElementById("clear-all-btn")!,

    table: document.getElementById("current-settings-table")!,
}

type CookieSettingsEntry = Pick<
    chrome.contentSettings.CookieSetDetails,
    "primaryPattern" | "secondaryPattern" | "setting"
>

function keyForEntry(entry: CookieSettingsEntry) {
    return `${entry.primaryPattern};${entry.secondaryPattern}`
}

type CookieSettings = Record<string, CookieSettingsEntry>

let currentSettings: CookieSettings = {}

function onSyncedSettings(cookieSettings: CookieSettings | undefined) {
    currentSettings = cookieSettings || {}
    updateTable(currentSettings)
}

async function removeEntry(entry: CookieSettingsEntry) {
    // Step 1: clear all cookie settings
    await api(chrome.contentSettings.cookies, "clear", {})

    // Step 2: restore all cookie settings except for the removed entry
    const { [keyForEntry(entry)]: removedEntry, ...remainingEntries } = currentSettings
    await Promise.allSettled(
        Object.values(remainingEntries).map((entry) => api(chrome.contentSettings.cookies, "set", entry))
    )
    // If restoring an entry in contentSettings.cookies failed, we're still
    // gonna hold on to that entry in our copy of the data, kinda like a backup.
    await api(chrome.storage.sync, "set", { cookieSettings: remainingEntries })
}

// Initial fetch.
api(chrome.storage.sync, "get", "cookieSettings").then(({ cookieSettings }) => onSyncedSettings(cookieSettings))

// Subsequent changes.
chrome.storage.onChanged.addListener(({ cookieSettings }) => {
    if (cookieSettings) {
        onSyncedSettings(cookieSettings.newValue)
    }
})

function autoCompletePath(pattern: string): string {
    const patternWithoutPath = new RegExp("^(.+//[^/]+)(/)?$")
    const match = pattern.match(patternWithoutPath)
    if (match) {
        const patternWithoutTrailingSlash = match[1]
        return patternWithoutTrailingSlash + "/*"
    }
    return pattern
}

ui.addForm.addEventListener("submit", async (event) => {
    event.preventDefault()

    const entry: CookieSettingsEntry = {
        primaryPattern: autoCompletePath(ui.primaryPatternInput.value),
        secondaryPattern: ui.secondaryPatternInput.value ? autoCompletePath(ui.secondaryPatternInput.value) : undefined,
        setting: ui.settingDropdown.value as CookieSettingsEntry["setting"],
    }

    await api(chrome.contentSettings.cookies, "set", entry)
    await api(chrome.storage.sync, "set", {
        cookieSettings: {
            ...currentSettings,
            [keyForEntry(entry)]: entry,
        },
    })
})

ui.setAllButton.addEventListener("click", () => {
    for (const entry of Object.values(currentSettings)) {
        api(chrome.contentSettings.cookies, "set", entry)
    }
})

ui.clearAllButton.addEventListener("click", async () => {
    if (window.confirm("Clear all settings?")) {
        await api(chrome.contentSettings.cookies, "clear", {})
        await api(chrome.storage.sync, "clear")
    }
})

function updateTable(cookieSettings: CookieSettings) {
    const newTableBody = document.createElement("tbody")
    const sortedKeys = Object.keys(cookieSettings).sort()
    for (const key of sortedKeys) {
        const entry = cookieSettings[key]
        newTableBody.appendChild(createTableRow(entry))
    }
    ui.table.replaceChild(newTableBody, ui.table.getElementsByTagName("tbody")[0])
}

function createTableRow(entry: CookieSettingsEntry) {
    const row = document.createElement("tr")

    const primaryPatternCell = document.createElement("td")
    primaryPatternCell.textContent = entry.primaryPattern
    row.appendChild(primaryPatternCell)

    const secondaryPatternCell = document.createElement("td")
    secondaryPatternCell.textContent = entry.secondaryPattern || "*"
    row.appendChild(secondaryPatternCell)

    const settingCell = document.createElement("td")
    settingCell.textContent = entry.setting
    row.appendChild(settingCell)

    const removeButton = document.createElement("button")
    removeButton.textContent = "Remove"
    removeButton.onclick = () => removeEntry(entry)

    const removeButtonCell = document.createElement("td")
    removeButtonCell.appendChild(removeButton)
    row.appendChild(removeButtonCell)

    return row
}
