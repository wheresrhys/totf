import { EmptySessionsToggle } from '../EmptySessionsToggle';
import { testTwoOptionToggle } from './helpers/two-option-toggle';

testTwoOptionToggle({
	name: 'EmptySessionsToggle',
	renderToggle: (props) => <EmptySessionsToggle {...props} />,
	labelText: 'Empty sessions:',
	options: [
		{ value: false, label: 'Show' },
		{ value: true, label: 'Hide' }
	]
});
