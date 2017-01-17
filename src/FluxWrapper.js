// This code borrowed with permission from f.lux-react and then modified to match
// solidify-flux differences

import classnames from "classnames";
import omit from "lodash.omit";
import React, { Component, PropTypes } from "react";
import result from "lodash.result";

import baseModel from "./baseModel";
import identity from "./identity";

const typeSpec = {
	errors: React.PropTypes.object
};

const propNamesBlacklist = [
	'bind',
	'checkedType',
	'children',
	'disabled',
	'flushOnChange',
	'flushOnEnter',
	'format',
	'model',
	'onBlur',
	'onChange',
	'onChangeTx',
	'onUpdate',
	'parse',
	'ref',
	'value',
];


function defaultChangeTx(callback) {
	return function(event) {
		callback(event)
	}
}


/**
	A component that binds to a Flux model property to a wrapped component. This can be used with
	the built-in <input> tag or a custom component that supports the normal React bound component
	conventions.

	Example:
		<FluxWrapper
				model={ person }
				bind="dob"
				className="form-control name"
			>
				<MaskedInput
					mask="dd?//dd?//dddd"
					placeholder="mm/dd/yyyy"
				/>
		</FluxWrapper>

	This component accepts the following flux related properties:
		model - the Flux model (required)
		bind - the name of the flux property the component exposes (required)
		className - specify the classes for the wrapped compnent on THIS component and NOT the wrapped
			component. This quirk is required so this component can set the 'error' class when a
			validation error is present on the context.
		format - translation function called when the model[bind] value changes to convert the model
			value to a format suitable for viewing. Useful for converting values for localization
			purposes, such as dates, numbers, currencies. The function signature is:

				function format(value) { return value }

			Default value is the identity function.
		parse - translation function called when setting the model[bind] value to convert a displayed
			value to proper format for storage. Function signature is same as the format property.
			This method can throw a RangeError if the value is not valid. The default value is the
			identity function.
		checkedType - boolean flag to specify if the model[bind] value should be converted to a
			'checked' property for the wrapped component. Set to true for <input type='checkbox|radio'>
			or other components utilizing a checked property.  Default is false.
		flushOnChange - boolean flag specifying if the model[bind] value should be updated on each
			input change. The value will always be flushed on a blur event. This value is treated as
			set when the 'checkedType' property is set to true. The default is false.
		flushOnEnter - boolean flag specifying if model[bind] value should be set when the return
			key is pressed. Default is true.
		onChangeTx - onChange() event handler for converting non-React standard onChange() callback
			to standard React format, ie callback(event). The event object should at a minimum support
			the value and checked properties (as appropriate) and the persist() method. The function
			signature is:

				function changeTx(callback) {
					return function(dataFromComponent) {
						callback(new MyCustomEvevnt(dataFromComponent))
					}
				}

			Thus, translation function takes a callback from the FluxWrapper and returns a function
			that will be passed to the wrapped compnent's 'onChange' property. The 'onChange' handler
			then converts the onChange event data to a React-like event and invokes the callback.
			(Optional)

	Disabled behavior
		The disabled property may be set on this component. The wrapped component will receive a
		disabled property set to true if the 'disabled' property is explicitly specified or the
		model.$().isReadonly() method return true.

	'className' property handling
		DO NOT set the 'className' property on the wrapped component. Instead set it on this component
		and it will be passed to the wrapped component. This convention allows the FluxWrapper to add
		the 'error' class to the wrapped compnents 'className' properties when a validation error is
		present on the context.
*/
export default class FluxWrapper extends Component {
	constructor(props, context) {
		super(props, context);

		this.state = {
				error: false,
				value: this._formattedPropValue(),
			}
	}

	get value() {
		const { parse } = this.props;
		const { value } = this.state;

		return parse(value);
	}

	componentWillReceiveProps(nextProps, nextContext) {
		const modelValue = this._modelValue(nextProps);
		const prevModelValue = this._modelValue();

		if (modelValue !== prevModelValue && (this.flushValueSet && modelValue !== this.flushValue)) {
			this.setState({
					value: this._formattedPropValue(nextProps),
				});
		}

		delete this.flushValue;
		delete this.flushValueSet;
	}

	getChildContext () {
		var context = this.context;
		var props = this.props;

		return {
			errors: props.errors || context.errors || this.state.errors,
		};
	}

	flush() {
		return new Promise( (resolve, reject) => {
			this.flushValue = this._updateValue( (currModel, error) => {
				if (error) {
					reject(error);
				} else {
					resolve(model);
				}
			});

			this.flushValueSet = true;
		});
	}

	_formattedPropValue(props=this.props) {
		const { format } = props;
		const modelValue = this._modelValue(props);

		return format(modelValue);
	}

	_handleBlur(event) {
		const { onBlur } = this.props;

		this.setState({
				hasFocus: false,
				focusValue: null,    //autosave will have already occurred so can clear
			},
			() => {
				this._updateValue();

				onBlur && onBlur(event)
			}
		);
	}

	_handleChange(event) {
		const { format, onChange, type } = this.props;
		const { checked, value } = event.target;
		const nextModelValue = this._isCheckedType() ?checked :value;

		// Cannot reuse event as noted below but keep for now (1/7/2017)
		// if (onChange) {
		// 	event.persist();

		// 	event.target.value = nextModelValue;
		// }

		this.setState(
			{
				value: nextModelValue,
			},
			() => {
				if (onChange) {
					// this is causing the cursor to jump to end of input (strange)
					//event.target.value = nextModelValue;

					// create a really shallow and dumb event (should meet our needs for now). Really
					// need to create an actual event to propagate.
					onChange({
						target: {
							value: nextModelValue
						}
					})
				}

				if (this._shouldFlushOnChange()) {
					this._updateValue();
				}
			});
	}

	_handleFocus(event) {
		const { onFocus } = this.props;

		this.setState(
			{
				hasFocus: true,
				focusValue: this._modelValue(),    // will compare on blur to see if value changed
			},
			() => onFocus && onFocus(event)
		);
	}

	_handleKeyPress(event) {
		const { flushOnEnter, onKeyPress } = this.props;

		if (event.charCode === 13 && flushOnEnter) {
			this._updateValue();
		}

		onKeyPress && onKeyPress(event);
	}

	_hasError() {
		const { error } = this.state;
		const { errors } = this.context;
		const { bind, model } = this.props;
		const { target, key } = baseModel(model, bind);

		return error || (errors && errors.hasPath(target, key));
	}

	_isCheckedType() {
		const { checkedType } = this.props;

		return checkedType;
	}

	_modelValue(props=this.props) {
		const { model, bind } = props;

		return result(model, bind);
	}

	_shouldFlushOnChange() {
		const { flushOnChange, type } = this.props;

		return flushOnChange || (flushOnChange == false && this._isCheckedType());
	}

	_updateError(msg, error) {
		const { bind, model } = this.props;
		const { hasFocus } = this.state;
		const wrappedValue = this.wrapped && this.wrapped.value;

		if (process.env.NODE_ENV !== 'production') {
			console.warn(`FluxWrapper update error: path=${model.$().dotPath()}, ` +
					`property=${bind}, ${msg}`, error);

			//alert("Invalid value - input reset.\n\nSee console for details.")
		}

		// reset the managed value to last good property value
		this.setState({
			error: true,
			value: hasFocus
				?wrappedValue
				:this._formattedPropValue()
		})

	}

	_updateValue(callback) {
		const { bind, model, onUpdate, parse } = this.props;
		const { value } = this.state;
		const { target, key } = baseModel(model, bind);
		var nextModelValue;

		try {
			nextModelValue = parse(value);
		} catch(ex) {
			return this._updateError(`parse() error - value=${value}`, ex);
		}

		try {
			if (target[key] !== nextModelValue) {
				// update the model property
				try {
					target[key] = nextModelValue;
				} catch(ex) {
					return this._updateError(`assign error - nextModelValue=${nextModelValue}`, ex);
				}

				this.setState({ error: false })

				if (onUpdate || callback) {
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
			console.warn(`FluxInput Update Error: name=${bind}, path=${model.$().dotPath()}`, value, error);

			// ensure browser state does not display the bogus change in place
			this.forceUpdate();

			callback && callback(model, error);
		}

		return nextModelValue;
	}

	render() {
		const { children, disabled, format, model, onChangeTx } = this.props;
		const className = classnames(this.props.className || '', {
				'error': this._hasError()
			});
		const childProps = { ...omit(this.props, propNamesBlacklist), className };
		const { value } = this.state;

		childProps.ref = ref => this.wrapped = ref;
		childProps.disabled = model.$().isReadonly() || disabled;
		childProps.onBlur = event => this._handleBlur(event)
		childProps.onChange = onChangeTx( event => this._handleChange(event) )
//		childProps.onChange = event => this._handleChange(event)
		childProps.onFocus =event => this._handleFocus(event)
		childProps.onKeyPress = event => this._handleKeyPress(event)
		childProps.value = value === undefined ?null :value;

		if (this._isCheckedType()) {
			childProps.checked = !!value;
		}

		return React.cloneElement(children, childProps);
	}
}

FluxWrapper.contextTypes = typeSpec;
FluxWrapper.childContextTypes = typeSpec;


FluxWrapper.defaultProps = {
	flushOnChange: false,
	flushOnEnter: true,
	format: identity,
	parse: identity,
}

FluxWrapper.propTypes = {
	bind: PropTypes.oneOfType([
			  PropTypes.string,
			  PropTypes.number
		  ]).isRequired,
	children: React.PropTypes.element.isRequired,
	checkedType: PropTypes.bool,
	disabled: PropTypes.bool,
	flushOnChange: PropTypes.bool,
	flushOnEnter: PropTypes.bool,
	format: PropTypes.func,
	model: PropTypes.object.isRequired,
	onBlur: PropTypes.func,
	onChange: PropTypes.func,
	onChangeTx: PropTypes.func,
	onError: PropTypes.func,
	onUpdate: PropTypes.func,
	parse: PropTypes.func,
}

