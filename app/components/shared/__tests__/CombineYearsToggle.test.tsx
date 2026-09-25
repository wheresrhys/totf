import { CombineYearsToggle } from '../CombineYearsToggle';
import { testTwoOptionToggle } from './helpers/two-option-toggle';

testTwoOptionToggle({
	name: 'CombineYearsToggle',
	renderToggle: (props) => <CombineYearsToggle {...props} />,
	labelText: 'Combine years:',
	options: [
		{ value: true, label: 'Combined' },
		{ value: false, label: 'By year' }
	]
});
