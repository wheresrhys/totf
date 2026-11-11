import { CountsBiometricsToggle } from '../CountsBiometricsToggle';
import { testTwoOptionToggle } from './helpers/two-option-toggle';

testTwoOptionToggle({
	name: 'CountsBiometricsToggle',
	renderToggle: (props) => <CountsBiometricsToggle {...props} />,
	labelText: 'Columns:',
	options: [
		{ value: false, label: 'Counts' },
		{ value: true, label: 'Biometrics' }
	]
});
