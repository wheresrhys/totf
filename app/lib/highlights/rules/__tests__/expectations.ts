export const expectations = {
	birds: {
		printedCombinedHighlights: {
			global: 'Busiest session ever: 12 birds',
			'tied global': 'Joint busiest session ever: 12 birds',
			'singular global': 'Busiest session ever: 1 bird',
			'second global': 'Second busiest session ever: 12 birds',
			'tied second global': 'Joint second busiest session ever: 12 birds',
			'tied second of year': 'Joint second busiest session of 2020: 12 birds',
			'this year': 'Busiest session this year: 12 birds',
			'tied global and second of year':
				'Joint busiest session ever and second busiest of 2020: 12 birds',
			'tied second of month':
				'Joint second busiest February session ever: 12 birds',
			'global and tied second of year and third of month':
				'Busiest session ever, joint second busiest of 2020 and third busiest in any February: 12 birds'
		},
		printedHighlightsOfType: {
			'single session': 'Busiest',
			'multiple month': 'Most individuals'
		}
	},
	encounters: {
		printedCombinedHighlights: {
			global: 'Session with most encounters ever: 12 encounters',
			'tied global': 'Month with equal most encounters ever: 12 encounters',
			'singular global': 'Month with most encounters ever: 1 encounter',
			'second global': 'Month with second most encounters ever: 12 encounters',
			'tied second global':
				'Month with equal second most encounters ever: 12 encounters',
			'tied second of year':
				'Month with equal second most encounters of 2020: 12 encounters',
			'this year': 'Month with most encounters this year: 12 encounters',
			'tied global and second of year':
				'Month with equal most encounters ever and second most of 2020: 12 encounters'
		},
		printedHighlightsOfType: {
			'single session': 'Most encounters',
			'multiple month': 'Most encounters'
		}
	},
	species: {
		printedCombinedHighlights: {
			global: 'Most varied session ever: 12 species',
			'tied global': 'Joint most varied session ever: 12 species',
			'singular global': 'Most varied session ever: 1 species',
			'second global': 'Second most varied session ever: 12 species',
			'tied second global': 'Joint second most varied session ever: 12 species',
			'tied second of year':
				'Joint second most varied session of 2020: 12 species',
			'this year': 'Most varied session this year: 12 species',
			'tied global and second of year':
				'Joint most varied session ever and second most varied of 2020: 12 species',
			'tied second of month':
				'Joint second most varied session in any February: 12 species',
			'global and tied second of year and third of month':
				'Most varied session ever, joint second most varied of 2020 and third most varied in any February: 12 species'
		},
		printedHighlightsOfType: {
			'single session': 'Most varied',
			'multiple month': 'Most varied'
		}
	},
	newBirds: {
		printedCombinedHighlights: {
			global: 'Highest new bird count ever: 12 birds',
			'tied global': 'Joint highest new bird count ever: 12 birds',
			'singular global': 'Highest new bird count ever: 1 bird',
			'second global': 'Second highest new bird count ever: 12 birds',
			'tied second global':
				'Joint second highest new bird count ever: 12 birds',
			'tied second of year':
				'Joint second highest new bird count of 2020: 12 birds',
			'this year': 'Highest new bird count this year: 12 birds',
			'tied global and second of year':
				'Joint highest new bird count ever and second highest of 2020: 12 birds',
			'tied second of month':
				'Joint second highest new bird count in any February: 12 birds',
			'global and tied second of year and third of month':
				'Highest new bird count ever, joint second highest of 2020 and third highest in any February: 12 birds'
		},
		printedHighlightsOfType: {
			'single session': 'Most new birds',
			'multiple month': 'Most new birds'
		}
	},
	juvs: {
		printedCombinedHighlights: {
			global: 'Session with most juvs ever: 12 birds',
			'tied global': 'Session with equal most juvs ever: 12 birds',
			'singular global': 'Session with most juvs ever: 1 bird',
			'second global': 'Session with second most juvs ever: 12 birds',
			'tied second global':
				'Session with equal second most juvs ever: 12 birds',
			'tied second of year':
				'Session with equal second most juvs of 2020: 12 birds',
			'this year': 'Session with most juvs this year: 12 birds',
			'tied global and second of year':
				'Session with equal most juvs ever and second most of 2020: 12 birds',
			'tied second of month':
				'Session with equal second most juvs in any February: 12 birds',
			'global and tied second of year and third of month':
				'Session with most juvs ever, equal second most of 2020 and third most in any February: 12 birds'
		},
		printedHighlightsOfType: {
			'single session': 'Most juvs',
			'multiple month': 'Most juvs'
		}
	},
	singleSpeciesCount: {
		printedCombinedHighlights: {
			global: 'Highest single species session count ever: 12 birds',
			'tied global':
				'Joint highest single species session count ever: 12 birds',
			'singular global': 'Highest single species session count ever: 1 bird',
			'second global':
				'Second highest single species session count ever: 12 birds',
			'tied second global':
				'Joint second highest single species session count ever: 12 birds',
			'tied second of year':
				'Joint second highest single species session count of 2020: 12 birds',
			'this year': 'Highest single species session count this year: 12 birds',
			'tied global and second of year':
				'Joint highest single species session count ever and second highest of 2020: 12 birds',
			'tied second of month':
				'Joint second highest single species session count in any February: 12 birds',
			'global and tied second of year and third of month':
				'Highest single species session count ever, joint second highest of 2020 and third highest in any February: 12 birds'
		},
		printedHighlightsOfType: {
			'single session': 'Most individuals of a single species',
			'multiple month': 'Most individuals of a single species'
		}
	},
	singleSpeciesEncounters: {
		printedCombinedHighlights: {
			global:
				'Most encounters of a single species in a session ever: 12 encounters',
			'tied global':
				'Equal most encounters of a single species in a month ever: 12 encounters',
			'singular global':
				'Most encounters of a single species in a month ever: 1 encounter',
			'second global':
				'Second most encounters of a single species in a month ever: 12 encounters',
			'tied second global':
				'Equal second most encounters of a single species in a month ever: 12 encounters',
			'tied second of year':
				'Equal second most encounters of a single species in a month in 2020: 12 encounters',
			'this year':
				'Most encounters of a single species in a month this year: 12 encounters',
			'tied global and second of year':
				'Equal most encounters of a single species in a month ever and second most of 2020: 12 encounters'
		},
		printedHighlightsOfType: {
			'single session': 'Most encounters of a single species',
			'multiple month': 'Most encounters of a single species'
		}
	},
	eachSpeciesCount: {
		printedCombinedHighlights: {
			global: 'Highest Robin count ever: 12 birds',
			'tied global': 'Equal highest Robin count ever: 12 birds',
			'singular global': 'Highest Robin count ever: 1 bird',
			'second global': 'Second highest Robin count ever: 12 birds',
			'tied second global': 'Equal second highest Robin count ever: 12 birds',
			'tied second of year':
				'Equal second highest Robin count of 2020: 12 birds',
			'this year': 'Highest Robin count this year: 12 birds',
			'tied global and second of year':
				'Equal highest Robin count ever and second highest of 2020: 12 birds',
			'tied second of month':
				'Equal second highest Robin count in any February: 12 birds',
			'global and tied second of year and third of month':
				'Highest Robin count ever, equal second highest of 2020 and third highest in any February: 12 birds'
		},
		printedHighlightsOfType: {
			'single session': 'Highest count for Robin',
			'multiple month': 'Highest counts for Robin'
		}
	},
	eachSpeciesJuvs: {
		printedCombinedHighlights: {
			global: 'Highest juv Robin count ever: 12 birds',
			'tied global': 'Equal highest juv Robin count ever: 12 birds',
			'singular global': 'Highest juv Robin count ever: 1 bird',
			'second global': 'Second highest juv Robin count ever: 12 birds',
			'tied second global':
				'Equal second highest juv Robin count ever: 12 birds',
			'tied second of year':
				'Equal second highest juv Robin count of 2020: 12 birds',
			'this year': 'Highest juv Robin count this year: 12 birds',
			'tied global and second of year':
				'Equal highest juv Robin count ever and second highest of 2020: 12 birds',
			'tied second of month':
				'Equal second highest juv Robin count in any February: 12 birds',
			'global and tied second of year and third of month':
				'Highest juv Robin count ever, equal second highest of 2020 and third highest in any February: 12 birds'
		},
		printedHighlightsOfType: {
			'single session': 'Highest juv count for Robin',
			'multiple month': 'Highest juv counts for Robin'
		}
	},
	rarities: {
		printedCombinedHighlights: {
			global: '12 Robin ever',
			'tied global': '12 Robin ever',
			'singular global': '1 Robin ever',
			'second global': '12 Robin ever',
			'tied second global': '12 Robin ever',
			'tied second of year': '12 Robin of 2020',
			'this year': '12 Robin this year',
			'tied global and second of year': '12 Robin ever',
			'tied second of month': '12 Robin in any February',
			'global and tied second of year and third of month': '12 Robin ever'
		},
		printedHighlightsOfType: {
			'single session': 'Rarities',
			'multiple month': 'Rarities'
		}
	},
	heaviestOfSpecies: {
		printedCombinedHighlights: {
			global: 'Heaviest Robin ever: 12g',
			'tied global': 'Joint heaviest Robin ever: 12g',
			'singular global': 'Heaviest Robin ever: 1g',
			'second global': 'Second heaviest Robin ever: 12g',
			'tied second global': 'Joint second heaviest Robin ever: 12g',
			'tied second of year': 'Joint second heaviest Robin of 2020: 12g',
			'this year': 'Heaviest Robin this year: 12g',
			'tied global and second of year':
				'Joint heaviest Robin ever and second heaviest of 2020: 12g',
			'tied second of month':
				'Joint second heaviest Robin in any February: 12g',
			'global and tied second of year and third of month':
				'Heaviest Robin ever, joint second heaviest of 2020 and third heaviest in any February: 12g'
		},
		printedHighlightsOfType: {
			'single session': 'Heaviest Robin',
			'multiple month': 'Heaviest Robins'
		}
	},
	lightestOfSpecies: {
		printedCombinedHighlights: {
			global: 'Lightest Robin ever: 12g',
			'tied global': 'Joint lightest Robin ever: 12g',
			'singular global': 'Lightest Robin ever: 1g',
			'second global': 'Second lightest Robin ever: 12g',
			'tied second global': 'Joint second lightest Robin ever: 12g',
			'tied second of year': 'Joint second lightest Robin of 2020: 12g',
			'this year': 'Lightest Robin this year: 12g',
			'tied global and second of year':
				'Joint lightest Robin ever and second lightest of 2020: 12g',
			'tied second of month':
				'Joint second lightest Robin in any February: 12g',
			'global and tied second of year and third of month':
				'Lightest Robin ever, joint second lightest of 2020 and third lightest in any February: 12g'
		},
		printedHighlightsOfType: {
			'single session': 'Lightest Robin',
			'multiple month': 'Lightest Robins'
		}
	}
};
