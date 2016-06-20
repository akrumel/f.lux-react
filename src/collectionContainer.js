import autobind from "autobind-decorator";
import { Component, createElement, PropTypes } from "react";
import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";


// http://stackoverflow.com/questions/1026069/capitalize-the-first-letter-of-string-in-javascript
function capitalize(s) {
	return s && s[0].toUpperCase() + s.slice(1);
}

function defaultErrorHandler(msg, error) {
	console.warn(msg);

	if (error.stack) {
		console.warn(error.stack);
	}
}

function getDisplayName(WrappedComponent) {
	return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

// Helps track hot reloading.
var nextVersion = 0;


export default function collectionContainer(collectionPropName, errorHandler, options={}) {
	const { page=false, withRef=false } = options;

	// Helps track hot reloading.
	const version = nextVersion++;
	const finalErrorHandler = errorHandler || defaultErrorHandler;

	return function wrapWithContainer(WrappedComponent, HourglassComponent) {
		function onSyncError(error) {
			const msg = `Unable to sync collection "${collectionPropName}" for component ` +
				`${getDisplayName(WrappedComponent)} due to error: ${error}`;

			finalErrorHandler(msg, error);
		}

		class CollectionContainer extends Component {
			constructor(props, context) {
				super(props, context);

				// Helps track hot reloading.
				this.version = version;

				this.collection = props[collectionPropName];

				this.endpointId = this.collection && this.collection.endpoint && this.collection.endpoint.id;
				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;

				this.state = {
					error: null,
				};
			}

			componentWillMount() {
				this.state.mounted = true;
				this.checkForCollectionChange(this.props);

				if (this.collection && !this.syncCalled() && this.collection.isConnected()) {
					this.sync();
				}
			}

			componentWillReceiveProps(nextProps) {
				this.checkForCollectionChange(nextProps);
			}

			componentWillUnmount() {
				this.state.mounted = false;
			}

			checkForCollectionChange(props) {
				const collection = props[collectionPropName];

				if (collection === this.collection) { return }

				this.collection = collection;

				if (!collection) {
					this.endpointId = null;
					this.clearError();
				} else {
					 if (this.endpointId !== collection.endpoint.id) {
						this.clearError();
					}

					this.endpointId = collection.endpoint.id;

					if (this.collection.isConnected() && !this.syncCalled() && !this.state.error) {
						this.sync();
					}
				}
			}

			@autobind
			clearError(resync) {
				if (!this.state.error) { return }

				this.setState(
					{ error: null },
					() => {
							if (resync && this.collection.isConnected()) {
								this.sync();
							}
						}
					);
			}

			@autobind
			fetchError(error) {
				if (errorHandler) {
					errorHandler(error.message, error);
				}

				if (this.state.mounted) {
					this.setState({ error: error });
				}
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
				return {
					...this.props,
					[`${collectionPropName}Error`]: this.state.error,
					[`clear${capitalize(collectionPropName)}Error`]: this.clearError,
					[`sync${capitalize(collectionPropName)}`]: this.sync,
				}
			}

			syncCalled() {
				const collection = this.collection;

				return collection && (
					(collection.fetching || collection.synced) ||
					page && collection.paging || collection.nextOffset != 0);
			}

			@autobind
			sync(mergeOp) {
				if (this.syncCalled() || (this.collection && !this.collection.isConnected()) ) {
					return
				}

				invariant(this.collection, `Could not find "${collectionPropName}" in the props of ` +
					`<${this.constructor.displayName}>. Either wrap the root component in a storeContainer(), or ` +
					`explicitly pass "${collectionPropName}" as a prop to <${this.constructor.displayName}>.`
				)

				if (page) {
					if (!this.collection.fetching && !this.collection.paging) {
						this.collection.fetchNext(mergeOp)
							.catch(this.fetchError);
					}
				} else {
					this.collection.fetch(null, mergeOp)
						.catch(this.fetchError);
				}
			}

			render() {
				const mergedProps = this.mergeProps();

				if (HourglassComponent) {
					if (this.collection && (this.collection.fetching || this.collection.paging)) {
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
			CollectionContainer.prototype.componentWillUpdate = function componentWillUpdate() {
				if (this.version === version) {
					return
				}

				// We are hot reloading!
				this.version = version
			}


			return hoistStatics(CollectionContainer, WrappedComponent)
		}
	}
}