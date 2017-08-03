import omit from "lodash.omit";
import result from "lodash.result";
import React, { Component, PropTypes } from "react";

import baseModel from "./baseModel";
import identity from "./identity";


const propNamesBlacklist = [
	'bind',
	'children',
	'disabled',
	'format',
	'integer',
	'model',
	'onChange',
	'onUpdate',
	'parse',
	'ref',
	'value',
];


export default class FluxSelect extends Component {
	get value() {
		const { format } = this.props;
		const modelValue = this._modelValue();

		return format(modelValue);
	}

	_handleChange(event) {
		const { bind, format, model, onChange, onError, onUpdate, parse } = this.props;
		const { target, key } = baseModel(model, bind);
		const { value } = event.target;

		try {
			const modelValue = this._modelValue();
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
							console.warn(`FluxSelect onChange() Error: name=${bind}, path=${model.$().dotPath()}`, cbError);
						}
					}

					if (onUpdate) {
						try {
							onUpdate(currModel, bind);
						} catch(cbError) {
							console.warn(`FluxSelect onUpdate() Error: name=${bind}, path=${model.$().dotPath()}`, cbError);
						}
					}
				});
			}
		} catch(error) {
			console.warn(`FluxSelect Change Error: name=${bind}, path=${model.$().dotPath()}`, error);

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
		const { disabled, format, model } = this.props;
		const modelValue = this._modelValue();
		const value = format(modelValue) || "";
		const inputProps = omit(this.props, propNamesBlacklist);

		return <select { ...inputProps }
				ref="select"
				disabled={ model.$().isReadonly() || disabled }
				value={ value }
				onChange={ event => this._handleChange(event) }
			>
				{ this.props.children || null }
			</select>
	}
}

FluxSelect.defaultProps = {
	format: identity,
}

FluxSelect.propTypes = {
	bind: PropTypes.oneOfType([
			  PropTypes.string,
			  PropTypes.number
		  ]).isRequired,
	format: PropTypes.func,
	integer: PropTypes.bool,
	model: PropTypes.object.isRequired,
	onChange: PropTypes.func,
	onError: PropTypes.func,
	onUpdate: PropTypes.func,
	parse: PropTypes.func,
}


