import autobind from "autobind-decorator";
import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";
import { Component, createElement, PropTypes } from "react";

import { Store } from "f.lux";

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
	const { page=false, resync=false, withRef=false } = options;

	// Helps track hot reloading.
	const version = nextVersion++;

	return function wrapWithContainer(WrappedComponent, HourglassComponent) {
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
				this.mounted = true;

				this.displayName = getDisplayName(WrappedComponent);

				this.state = {
					error: null,
					restored: false,
				};
			}

			componentWillMount() {
				this.checkForCollectionChange(this.props);

				if (this.collection && this.collection.isConnected()) {
					if (!this.syncCalled()) {
						this.sync();
					} else if (resync) {
						this.resync();
					}
				}
			}

			componentWillReceiveProps(nextProps) {
				this.checkForCollectionChange(nextProps);
			}

			componentWillUnmount() {
				this.mounted = false;
			}

			checkForCollectionChange(props) {
				const { error, restored } = this.state;
				const collection = props[collectionPropName];
				const endpointId = collection && collection.endpoint && collection.endpoint.id;
				const prevCollection = this.collection;

				if (collection === this.collection) { return }

				this.collection = collection;

				if (!collection) {
					this.endpointId = null;
					this.clearError();
				} else {
					 if (this.endpointId !== endpointId) {
						this.clearError();
					}

					this.endpointId = endpointId;

					if (this.collection.isConnected() && !this.syncCalled() && !error && !restored) {
						this.sync();
					} else if (this.state.error && (collection.synced ||
							(prevCollection && collection.nextOffset !== prevCollection.nextOffset)))
					{
						this.setState({ error: null });
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
				const msg = `Unable to sync collection "${collectionPropName}" for component ` +
					`${getDisplayName(WrappedComponent)} due to error: ${error}`;

				if (this.mounted) {
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

			@autobind
			restoreOnError(error) {
				if (this.collection.restored) {
					if (this.mounted) {
						this.setState({ restored: true });
					}
				} else {
					return Store.reject(error);
				}
			}

			resync() {
				invariant(this.collection, `Could not find "${collectionPropName}" in the props of ` +
					`<${this.constructor.displayName}>. Either wrap the root component in a storeContainer(), or ` +
					`explicitly pass "${collectionPropName}" as a prop to <${this.constructor.displayName}>.`
				)

				return this.collection.resync()
					.catch(this.restoreOnError)
					.catch(this.fetchError);
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

				this.setState({ error: null, restored: false });

				if (page) {
					if (!this.collection.fetching && !this.collection.paging) {
						this.collection.fetchNext(mergeOp)
							.catch(this.restoreOnError)
							.catch(this.fetchError);
					}
				} else {
					this.collection.fetch(null, mergeOp)
						.catch(this.restoreOnError)
						.catch(this.fetchError);
				}
			}

			syncCalled() {
				const collection = this.collection;

				return collection && (
						(collection.fetching || collection.synced) ||
						(page && (collection.paging || collection.nextOffset != 0))
					);
			}

			render() {
				const mergedProps = this.mergeProps();
				const collection = this.collection;

				if (HourglassComponent) {
					if (collection && collection.size===0 && collection.isConnected() &&
						(collection.fetching || collection.paging))
					{
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
		} else {
			return CollectionContainer;
		}
	}
}