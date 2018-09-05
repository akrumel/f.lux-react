import omit from "lodash.omit";
import result from "lodash.result";
import PropTypes from 'prop-types';
import React, { Component } from "react";

import baseModel from "./baseModel";
import identity from "./identity";


const propNamesBlacklist = [
	'bind',
	'children',
	'disabled',
	'flushOnChange',
	'flushOnEnter',
	'format',
	'model',
	'onBlur',
	'onChange',
	'onKeyPress',
	'onUpdate',
	'parse',
	'ref',
	'value',
];

const flushOnChangeTypeRe = /button|checkbox|radio/;


export default class FluxInput extends Component {
	constructor(props, context) {
		super(props, context);

		this.state = {
				value: this._formattedPropValue(),
			}
	}

	componentWillReceiveProps(nextProps, nextContext) {
		const modelValue = this._modelValue(nextProps);
		const prevModelValue = this._modelValue();

		if (modelValue !== prevModelValue) {
			this.setState({
					value: this._formattedPropValue(nextProps),
				});
		}
	}

	flush() {
		return new Promise( (resolve, reject) => {
			this._updateValue( (currModel, error) => {
				if (error) {
					reject(error);
				} else {
					resolve(model);
				}
			})
		})
	}

	focus() {
		this.refs && this.refs.input && this.refs.input.focus();
	}

	isCheckedType() {
		const { type } = this.props;

		return type === 'checkbox' || type === 'radio';
	}

	get value() {
		return this.state.value;
	}

	_formattedPropValue(props=this.props) {
		const { format } = props;
		const modelValue = this._modelValue(props);

		return format(modelValue);
	}

	_handleBlur = event => {
		const { onBlur } = this.props;

		this._updateValue();

		this.setState({
				hasFocus: false,
				focusValue: null,    //autosave will have already occurred so can clear
			},
			() => onBlur && onBlur(event) );
	}

	_handleChange = event => {
		const { format, onChange, parse, type } = this.props;
		const { checked, value } = event.target;
		const nextModelValue = parse(this.isCheckedType() ?checked :value);

		event.persist();

		this.setState(
			{
				value: format(nextModelValue),
			},
			() => {
				// really need to generate a new event using this as target
				onChange && onChange(event);

				if (this._shouldFlushOnChange()) {
					this._updateValue();
				}
			});
	}

	_handleFocus = event => {
		this.setState({
				hasFocus: true,
				focusValue: this._modelValue(),    // will compare on blur to see if value changed
			});
	}

	_handleKeyPress = event => {
		const { flushOnEnter, onKeyPress } = this.props;

		if (event.charCode === 13 && flushOnEnter) {
			this._updateValue();
		}

		onKeyPress && onKeyPress(event);
	}

	_modelValue(props=this.props) {
		const { model, bind } = props;

		return result(model, bind);
	}

	_shouldFlushOnChange() {
		const { flushOnChange, type } = this.props;

		return flushOnChange || (flushOnChange == false && flushOnChangeTypeRe.test(type));
	}

	_updateValue(callback) {
		const { bind, model, onUpdate, parse } = this.props;
		const { value } = this.state;
		const { target, key } = baseModel(model, bind);

		try {
			if (target[key] !== value) {
				target[key] = parse(value);

				if (onUpdate) {
					model.$().waitFor( currModel => {
						if (callback) {
							try {
								callback(currModel);
							} catch(cbError) {
								console.warn(`FluxInput Update Callback Error: name=${bind}, path=${model.$().dotPath()}`, cbError);
							}
						}

						if (onUpdate) {
							try {
								onUpdate(currModel, bind);
							} catch(cbError) {
								console.warn(`FluxInput onUpdate() Error: name=${bind}, path=${model.$().dotPath()}`, cbError);
							}
						}
					});
				}
			}
		} catch(error) {
			console.warn(`FluxInput Update Error: name=${bind}, path=${model.$().dotPath()}`, error);

			// ensure browser state does not display the bogus change in place
			this.forceUpdate();

			callback && callback(model, error);
		}
	}

	render() {
		const { disabled, model, type } = this.props;
		const { value } = this.state;
		const inputProps = omit(this.props, propNamesBlacklist);

		if (this.isCheckedType()) {
			inputProps.checked = value;
		}

		return <input { ...inputProps }
				ref="input"
				disabled={ model.$().isReadonly() || disabled }
				value={ value || "" }
				onBlur={ this._handleBlur }
				onChange={ this._handleChange }
				onFocus={ this._handleFocus }
				onKeyPress={ this._handleKeyPress }
			/>
	}
}

FluxInput.defaultProps = {
	format: identity,
	parse: identity,
	type: 'text'
}

FluxInput.propTypes = {
	bind: PropTypes.oneOfType([
			  PropTypes.string,
			  PropTypes.number
		  ]).isRequired,
	flushOnChange: PropTypes.bool,
	flushOnEnter: PropTypes.bool,
	format: PropTypes.func,
	model: PropTypes.object.isRequired,
	onBlur: PropTypes.func,
	onChange: PropTypes.func,
	onFocus: PropTypes.func,
	parse: PropTypes.func,
	type: PropTypes.oneOfType([
			  PropTypes.string,
			  PropTypes.func,
		  ]).isRequired,
}


