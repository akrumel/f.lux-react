// Borrowed-from/Based-on Redux Provider class (https://github.com/reactjs/react-redux/blob/master/src/components/Provider.js)

import { Component, PropTypes, Children } from "react";


var didWarnAboutReceivingStore = false;

function warnAboutReceivingStore() {
	if (didWarnAboutReceivingStore) { return }

	didWarnAboutReceivingStore = true;

	if (typeof console !== 'undefined' && typeof console.error === 'function') {
		console.error("<Provider> does not support changing `store` on the fly.");
	}
}

export default class Provider extends Component {
	constructor(props, context) {
		super(props, context);

		this.store = props.store;
	}

	getChildContext() {
		return {
				store: this.store
			};
	}

	render() {
		const { children } = this.props;

		return Children.only(children);
	}
}

if (process.env.NODE_ENV !== 'production') {
	Provider.prototype.componentWillReceiveProps = function (nextProps) {
		const { store } = this;
		const { store: nextStore } = nextProps;

		if (store !== nextStore) {
			warnAboutReceivingStore();
		}
	}
}

Provider.propTypes = {
	store: PropTypes.object.isRequired,
	children: PropTypes.element.isRequired
}

Provider.childContextTypes = {
	store: PropTypes.object.isRequired,
}