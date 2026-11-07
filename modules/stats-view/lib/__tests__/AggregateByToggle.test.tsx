import { AggregateByToggle } from '../AggregateByToggle';
import { testTwoOptionToggle } from './helpers/two-option-toggle';

testTwoOptionToggle({
	name: 'AggregateByToggle',
	renderToggle: (props) => <AggregateByToggle {...props} />,
	labelText: 'Aggregate by:',
	options: [
		{ value: 'bird', label: 'Bird' },
		{ value: 'encounter', label: 'Encounter' }
	]
});
