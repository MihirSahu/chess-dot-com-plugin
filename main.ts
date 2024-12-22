import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	chessUsername: string;
	folder: string;
	currentYear: string;
	currentMonth: string;
	gameLimitYear: string;
	gameLimitMonth: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	chessUsername: '',
	folder: '',
	currentYear: '',
	currentMonth: '',
	gameLimitYear: '',
	gameLimitMonth: '',
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('crown', 'Pull games', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			this.setDate();
			new Notice('Downloading games...');
			//console.log("Current year/month:", this.settings.currentYear, this.settings.currentMonth);
			//console.log("Game limit year/month:", this.settings.gameLimitYear, this.settings.gameLimitMonth);
			const gameArchives = await this.fetchGameArchives();
			for (let archive of gameArchives['archives']) {
				const parsedDates = this.parseGameArchiveDates(archive);
				if (this.satisfiesDateCondition(parsedDates)) {
					//console.log(archive);
					const pgnData = await this.fetchMonthlyGames(parsedDates[0], parsedDates[1]) as string;
					await this.saveFileToPgnFolder(parsedDates[0], parsedDates[1], pgnData);
					await this.savePgnSectionsToMd(pgnData);
				}
			}

		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		//const statusBarItemEl = this.addStatusBarItem();
		//statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	// ------------------------- Utils
	fetchGameArchives = async () => {
		const response = await fetch(`https://api.chess.com/pub/player/${this.settings.chessUsername}/games/archives`);
		if (response.ok) {
			return await response.json();
		}
	}

	satisfiesDateCondition = (archiveDate: any) => {
		if ((Number(archiveDate[0]) >= Number(this.settings.gameLimitYear))) {
			if ((Number(archiveDate[0]) == Number(this.settings.gameLimitYear))) {
				if (Number(archiveDate[1]) >= Number(this.settings.gameLimitMonth)) {
					return true;
				}
			}
			else if ((Number(archiveDate[0]) > Number(this.settings.gameLimitYear))) {
				return true;
			}
		}
		return false;
	}

	parseGameArchiveDates = (archive: string) => {
		const dateString = archive.slice(-7);
		return dateString.split('/');
	}

	fetchMonthlyGames = async (year: string, month: string) => {
		const response = await fetch(`https://api.chess.com/pub/player/${this.settings.chessUsername}/games/${year}/${month}/pgn`);

		if (response.ok) {
			return await (await response.blob()).text();
		}
	}

	saveFileToPgnFolder = async (year: string, month: string, text: string) => {
		const fileName = `${year}-${month}.pgn`;
		console.log(fileName);
		if (!await this.app.vault.adapter.exists(this.settings.folder + '/pgn')) {
			await this.app.vault.adapter.mkdir(this.settings.folder + '/pgn');
		}
		const pgnFilePath = normalizePath(this.settings.folder + '/pgn/' + fileName);
		//console.log("Pgn folder path", pgnFilePath);
		await this.app.vault.adapter.write(pgnFilePath, text);
		return true;
	}

	savePgnSectionsToMd = async (pgnText: string) => {
    // Split the PGN file into separate games
    const games = pgnText.split('\n\n\n');

    // Log or return the parsed games
    console.log(`Found ${games.length} games.`);

		// Save to separate files
		for (let game of games) {
	    // Extract White and Black usernames
			const whiteMatch = game.match(/\[White\s+"(.+?)"\]/) as RegExpMatchArray;
			const blackMatch = game.match(/\[Black\s+"(.+?)"\]/) as RegExpMatchArray;

			// Extract date/time
			const UtcDate = game.match(/\[UTCDate\s+"(.+?)"\]/) as RegExpMatchArray;
			const UtcTime = game.match(/\[UTCTime\s+"(.+?)"\]/) as RegExpMatchArray;

			// Generate filename
			if (!await this.app.vault.adapter.exists(this.settings.folder)) {
				await this.app.vault.adapter.mkdir(this.settings.folder);
			}
			const fileName = `${whiteMatch[1]}-${blackMatch[1]} ${UtcDate[1].split(".").join("-")} ${UtcTime[1]}.md`;
			let mdFilePath = normalizePath(this.settings.folder + '/' + fileName);
			// If file exists, skip it
			if (await this.app.vault.adapter.exists(mdFilePath)) {
				console.log(fileName, "exists");
				continue;
			}

			// Write to file
			await this.app.vault.adapter.write(mdFilePath, '```');
			await this.app.vault.adapter.append(mdFilePath, game);
			await this.app.vault.adapter.append(mdFilePath, '```');
		}
	}

	setDate = () => {
		const today = new Date();
		this.settings.currentYear = today.getFullYear().toString();
		this.settings.currentMonth = (today.getMonth() + 1).toString();
	}
	// ------------------------- Utils

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Chess.com Username')
			.setDesc('https://www.chess.com/member/xxxxx')
			.addText(text => text
				.setPlaceholder('Enter your username')
				.setValue(this.plugin.settings.chessUsername)
				.onChange(async (value) => {
					this.plugin.settings.chessUsername = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Chess Games Folder')
			.setDesc('./random/chessgames')
			.addText(text => text
				.setPlaceholder('Enter your folder location')
				.setValue(this.plugin.settings.folder)
				.onChange(async (value) => {
					this.plugin.settings.folder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fetch Games Played After Year')
			.setDesc('yyyy')
			.addText(text => text
				.setPlaceholder('Enter year')
				.setValue(this.plugin.settings.gameLimitYear)
				.onChange(async (value) => {
					this.plugin.settings.gameLimitYear = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fetch Games Played After Month')
			.setDesc('mm')
			.addText(text => text
				.setPlaceholder('Enter month')
				.setValue(this.plugin.settings.gameLimitMonth)
				.onChange(async (value) => {
					this.plugin.settings.gameLimitMonth = value;
					await this.plugin.saveSettings();
				}));
	}
}
