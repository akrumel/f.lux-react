import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";
import isPlainObject from "lodash.isplainobject";
import PropTypes from 'prop-types';
import { Component, createElement } from "react";
import { shallowEqual } from "akutils";


const defaultInitialStoreProps = (shadow) => true;

const defaultMergeProps = (stateProps, parentProps, containerProps) => ({
		...parentProps,
		...stateProps,
		...containerProps,
	});

function getDisplayName(WrappedComponent) {
	return (WrappedComponent && WrappedComponent.displayName) ||
			(WrappedComponent && WrappedComponent.name) ||
			'Component';
}

// Helps track hot reloading.
var nextVersion = 0;


export default function storeContainer(mapShadowToProps, initialStoreProps, mergeProps, options = {}) {
	const shouldSubscribe = Boolean(mapShadowToProps);
	const finalInitialStoreProps = initialStoreProps || defaultInitialStoreProps;
	const finalMergeProps = mergeProps || defaultMergeProps
	const checkMergedEquals = finalMergeProps !== defaultMergeProps
	const { propsChanged=()=>true, pure = true, withRef = false } = options;

	// Helps track hot reloading.
	const version = nextVersion++;

	function computeMergedProps(stateProps, parentProps, containerProps) {
		const mergedProps = finalMergeProps(stateProps, parentProps, containerProps);

		invariant(
				isPlainObject(mergedProps),
				'`mergeProps` must return an object. Instead received %s.',
				mergedProps
			);

		return mergedProps;
	}

	return function wrapWithContainer(WrappedComponent) {
		class StoreContainer extends Component {
			constructor(props, context) {
				super(props, context);

				this.version = version;
				this.store = props.store || context.store;
				this.defaultStorePropsSet = false;

				invariant(this.store, `Could not find f.lux Store in the context or props of ` +
					`<${this.constructor.displayName}>. Either wrap the root component in a <Provider>, or explicitly ` +
					`pass "store" as a prop to <${this.constructor.displayName}>.`
				)

				this.displayName = getDisplayName(WrappedComponent);

				this.state = {
					defaultStorePropsSet: finalInitialStoreProps(this.store.shadow),
					shadow: this.store.shadow
				};
			}

			componentDidMount() {
				this.trySubscribe();
			}

			componentWillUnmount() {
				this.tryUnsubscribe()
				this.clearCache()
			}

			shouldComponentUpdate(nextProps, nextState) {
				this.haveOwnPropsChanged = !pure || !shallowEqual(nextProps, this.props);

				return !pure || this.haveOwnPropsChanged || this.hasShadowChanged;
			}

			clearCache() {
				this.dispatchProps = null
				this.stateProps = null
				this.haveOwnPropsChanged = true
				this.hasShadowChanged = true
				this.renderedElement = null
				this.finalMapShadowToProps = null
			}

			computeShadowProps(store, props) {
				if (!this.finalMapShadowToProps) {
					return this.configureFinalMapShadow(store, props);
				}

				const shadow = store.shadow;
				const shadowProps = this.doShadowPropsDependOnOwnProps ?
					this.finalMapShadowToProps(shadow, props, store) :
					this.finalMapShadowToProps(shadow);

				return shadowProps;
			}

			configureFinalMapShadow(store, props) {
				try {
					const mappedShadow = mapShadowToProps(store.shadow, props, store);
					const isFactory = typeof mappedShadow === 'function'

					this.finalMapShadowToProps = isFactory ?mappedShadow :mapShadowToProps;
					this.doShadowPropsDependOnOwnProps = this.finalMapShadowToProps.length !== 1;

					return isFactory ?this.computeShadowProps(store.shadow, props, store) :mappedShadow;
				} catch(ex) {
					console.warn("storeContainer shadow-props error", ex);
					throw ex;
				}
			}

			getWrappedInstance() {
				invariant(
						withRef,
						`To access the wrapped instance, you need to specify  { withRef: true } as the fourth `+
							`argument of the storeContainer() call.`
					);

				var wrapped = this.refs.wrappedInstance;

				while(wrapped.refs.wrappedInstance) {
					wrapped = wrapped.refs.wrappedInstance;
				}

				return wrapped;
			}

			handleChange = (store, shadow, prevShadow) => {
				if (!this.subscribed) { return }

				if (!this.state.defaultStorePropsSet) {
					this.setState({
						defaultStorePropsSet: finalInitialStoreProps(this.store.shadow)
					})
				}

				if (!pure || propsChanged(shadow, prevShadow)) {
					this.hasShadowChanged = true;
					this.setState({ shadow });
				}
			}

			isSubscribed() {
				return this.subscribed;
			}

			trySubscribe() {
				if (shouldSubscribe && !this.subscribed) {
					this.store.subscribe(this.handleChange);
					this.subscribed = true;
					this.handleChange(this.store, this.store._);
				}
			}

			tryUnsubscribe() {
				if (this.subscribed) {
					this.store.unsubscribe();
					this.subscribed = false;
				}
			}

			updateMergedPropsIfNeeded() {
				const containerProps = { store: this.store }
				const nextMergedProps = computeMergedProps(this.shadowProps, this.props, containerProps);

				if (this.mergedProps && checkMergedEquals && shallowEqual(nextMergedProps, this.mergedProps)) {
					return false;
				}

				this.mergedProps = nextMergedProps;

				return true;
			}

			updateShadowPropsIfNeeded() {
				const nextShadowProps = this.computeShadowProps(this.store, this.props);

				if (this.shadowProps && shallowEqual(nextShadowProps, this.shadowProps)) {
					return false;
				}

				this.shadowProps = nextShadowProps;

				return true;
			}

			render() {
				const {
						haveOwnPropsChanged,
						hasShadowChanged,
						renderedElement
					} = this;

				this.haveOwnPropsChanged = false;
				this.hasShadowChanged = false;

				//
				var shouldUpdateShadowProps = true;

				if (pure && renderedElement) {
					shouldUpdateShadowProps = hasShadowChanged || (haveOwnPropsChanged && this.doShadowPropsDependOnOwnProps);
				}

				// Map the current state to the desired shadow properties
				var haveShadowPropsChanged = false

				if (shouldUpdateShadowProps) {
					haveShadowPropsChanged = this.updateShadowPropsIfNeeded()
				}

				// Merge the shadow properties in with the component properties and store/shadow
				var haveMergedPropsChanged = true;

				if (haveShadowPropsChanged || haveOwnPropsChanged) {
					haveMergedPropsChanged = this.updateMergedPropsIfNeeded()
				} else {
					haveMergedPropsChanged = false
				}

				if (!haveMergedPropsChanged && renderedElement) {
					return renderedElement
				}

				if (!this.state.defaultStorePropsSet) {
					return options.renderWaiting ?options.renderWaiting(this.store.shadow) :null;
				}

				if (withRef) {
					this.renderedElement = createElement(WrappedComponent, {
							...this.mergedProps,
							ref: 'wrappedInstance'
						});
				} else {
					this.renderedElement = createElement(WrappedComponent, this.mergedProps);
				}

				return this.renderedElement;
			}
		}

		StoreContainer.displayName = `StoreContainer(${getDisplayName(WrappedComponent)})`
		StoreContainer.WrappedComponent = WrappedComponent

		StoreContainer.contextTypes = {
			store: PropTypes.object.isRequired,
		}

		if (process.env.NODE_ENV !== "production") {
			StoreContainer.prototype.componentDidUpdate = function componentDidUpdate() {
				if (this.version === version) {
					return
				}

				// We are hot reloading!
				this.version = version
				this.trySubscribe()
				this.clearCache()
			}


			return hoistStatics(StoreContainer, WrappedComponent)
		} else {
			return StoreContainer;
		}
	}
}