import { EmptyMonthsToggle } from '../EmptyMonthsToggle';
import { testTwoOptionToggle } from './helpers/two-option-toggle';

testTwoOptionToggle({
	name: 'EmptyMonthsToggle',
	renderToggle: (props) => <EmptyMonthsToggle {...props} />,
	labelText: 'Empty months:',
	options: [
		{ value: false, label: 'Show' },
		{ value: true, label: 'Hide' }
	]
});
