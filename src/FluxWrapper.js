import omit from "lodash.omit";
import result from "lodash.result";
import React, { Component, PropTypes } from "react";

import baseModel from "./baseModel";
import identity from "./identity";


const propNamesBlacklist = [
	'bind',
	'children',
	'format',
	'model',
	'onBlurTx',
	'onChange',
	'onChangeTx',
	'onKeyPressTx',
	'onUpdate',
	'parse',
	'ref',
	'value',
];

function defaultChangeTx(callback) {
	return function(event) {
		callback(event.target.value)
	}
}

function defaultEventTx(callback) {
	return function(event) { }
}

export default class FluxWrapper extends Component {
	get value() {
		const { format } = this.props;
		const modelValue = this._modelValue();

		return format(modelValue);
	}

	_handleChange(value) {
		const { bind, model, onChange, onError, onUpdate, parse } = this.props;
		const { target, key } = baseModel(model, bind);

		try {
			const parsedValue = this._parse(value);

			if (target[key] === parsedValue) { return }

			// update the model's value
			target[key] = parsedValue;

			if (onUpdate || onChange) {
				model.$().waitFor( currModel => {
					if (onChange) {
						try {
							onChange(event);
						} catch(cbError) {
							console.warn(`FluxWrapper onChange() Error: name=${bind}, path=${model.$().dotPath()}`, cbError);
						}
					}

					if (onUpdate) {
						try {
							onUpdate(currModel, bind);
						} catch(cbError) {
							console.warn(`FluxWrapper onUpdate() Error: name=${bind}, path=${model.$().dotPath()}`, cbError);
						}
					}
				});
			}
		} catch(error) {
			console.warn(`FluxWrapper Change Error: name=${bind}, path=${model.$().dotPath()}`, error);

			// ensure browser state does not display the bogus change in place
			this.forceUpdate();

			onError && onError(error, model.$().latest(), bind, event);
		}
	}

	_modelValue(props=this.props) {
		const { model, bind } = props;

		return result(model, bind);
	}

	_parse(value) {
		const { integer, parse } = this.props;

		if (parse) {
			return parse(value);
		} else if (integer) {
			let parsedValue = parseInt(value);

			return Number.isNaN(parsedValue) ?null :parsedValue;
		} else {
			return value;
		}
	}

	render() {
		const { children, disabled, format, model, onBlurTx, onChangeTx, onKeyPressTx } = this.props;
		const modelValue = this._modelValue();
		const value = format(modelValue);
		const inputProps = omit(this.props, propNamesBlacklist);

		inputProps.onChange = onChangeTx( value => this._handleChange(value) )
		inputProps.onBlur = onBlurTx( value => this._handleChange(value) )
		inputProps.onKeyPress = onKeyPressTx( value => this._handleChange(value) )
		inputProps.value = value;

		return React.cloneElement(children, inputProps);
	}
}


FluxWrapper.defaultProps = {
	format: identity,
	onChangeTx: defaultChangeTx,
	onBlurTx: defaultEventTx,
	onKeyPressTx: defaultEventTx,
	parse: identity,
}

FluxWrapper.propTypes = {
	bind: PropTypes.oneOfType([
			  PropTypes.string,
			  PropTypes.number
		  ]).isRequired,
	children: React.PropTypes.element.isRequired,
	format: PropTypes.func,
	model: PropTypes.object.isRequired,
	onChange: PropTypes.func,
	onBlurTx: PropTypes.func,
	onChangeTx: PropTypes.func,
	onKeyPressTx: PropTypes.func,
	onError: PropTypes.func,
	onUpdate: PropTypes.func,
	parse: PropTypes.func,
}


