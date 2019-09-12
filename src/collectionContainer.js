import autobind from "autobind-decorator";
import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";
import PropTypes from 'prop-types';
import { Component, createElement } from "react";

import { Store } from "f.lux";

import CollectionHandler from "./CollectionHandler";


// http://stackoverflow.com/questions/1026069/capitalize-the-first-letter-of-string-in-javascript
function capitalize(s) {
	return s && s[0].toUpperCase() + s.slice(1);
}

function getDisplayName(WrappedComponent) {
	return (WrappedComponent && WrappedComponent.displayName) ||
			(WrappedComponent && WrappedComponent.name) ||
			'Component';
}

// Helps track hot reloading.
var nextVersion = 0;


export default function collectionContainer(collectionPropName, options={}) {
	const { delay=null, page=false, resync=false, withRef=false } = options;

	// Helps track hot reloading.
	const version = nextVersion++;

	return function wrapWithContainer(WrappedComponent, HourglassComponent) {
		class CollectionContainer extends Component {
			constructor(props, context) {
				super(props, context);

				// Helps track hot reloading.
				this.version = version;

				this.handlers = Array.isArray(collectionPropName)
					?collectionPropName.map( n => new CollectionHandler(this, n, page, resync, delay) )
					:[ new CollectionHandler(this, collectionPropName, page, resync, delay) ];

				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;
				this.mounted = true;

				this.displayName = getDisplayName(WrappedComponent);

				this.state = { };
			}

			componentDidMount() {
				this.handlers.forEach( h => h.init() )
			}

			UNSAFE_componentWillReceiveProps(nextProps) {
				this.handlers.forEach( h => h.checkForCollectionChange(nextProps) );
			}

			componentWillUnmount() {
				this.mounted = false;
			}

			getWrappedInstance() {
				invariant(
						withRef,
						`To access the wrapped instance, you need to specify { withRef: true } as the fourth `+
							`argument of the collectionContainer() call.`
					);

				var wrapped = this.refs.wrappedInstance;

				while(wrapped.refs.wrappedInstance) {
					wrapped = wrapped.refs.wrappedInstance;
				}

				return wrapped;
			}

			mergeProps() {
				const handlerProps = this.handlers.reduce( (acc, h) => {
						acc[`${h.collectionPropName}Error`] = h.error;
						acc[`clear${capitalize(h.collectionPropName)}Error`] = h.clearErrorAndResync;
						acc[`sync${capitalize(h.collectionPropName)}`] = h.sync;
						acc[`resync${capitalize(h.collectionPropName)}`] = h.resync;

						return acc;
					}, {});

				return {
					...this.props,
					...handlerProps,
				}
			}

			render() {
				const mergedProps = this.mergeProps();

				if (HourglassComponent) {
					const showHourglass = this.handlers.some( h => {
							const collection = h.collection;

							return collection && collection.size===0 && collection.isConnected() &&
								(collection.fetching || collection.paging)
						});

					if (showHourglass) {
						if (!this.hourglass) {
							this.hourglass = createElement(HourglassComponent, mergedProps);
						}

						return this.hourglass;
					} else if (this.hourglass) {
						// clear the hourglass
						this.hourglass = null;
					}
				}

				if (withRef) {
					return this.renderedElement = createElement(WrappedComponent, {
							...mergedProps,
							ref: 'wrappedInstance'
						});
				} else {
					return this.renderedElement = createElement(WrappedComponent, mergedProps);
				}
			}
		}

		CollectionContainer.displayName = `CollectionContainer(${getDisplayName(WrappedComponent)})`
		CollectionContainer.WrappedComponent = WrappedComponent

		CollectionContainer.propTypes = {
			[collectionPropName]: PropTypes.object,
		}



		if (process.env.NODE_ENV !== "production") {
			CollectionContainer.prototype.componentDidUpdate = function componentDidUpdate() {
				if (this.version === version) {
					return
				}

				// We are hot reloading!
				this.version = version
			}


			return hoistStatics(CollectionContainer, WrappedComponent)
		} else {
			return CollectionContainer;
		}
	}
}