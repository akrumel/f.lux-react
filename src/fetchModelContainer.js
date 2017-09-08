import autobind from "autobind-decorator";
import PropTypes from 'prop-types';
import { Component, createElement } from "react";
import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";

import InteractionManager from "./InteractionManager";


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


/*
	The container function takes three parameters:
		* modelName - model will be stored in a property variable named `modelName`. For modelName of "foo"
				the model can be accessed using this.props.foo (required)
		* collectionPropName - property name where the f.lux collection can be found on the properties. This
				container does not utilize the context. (required)
		* options
			- `idProp` - property name containing the model's id. If set, the model is
				automatically retrieved in `componentDidMount()`.
			- `withRef` - `true` specifies the ref="wrappedInstance" for the wrapped element
				(default=false).

	The container sets up the following functions and values on the proeprties object based on the two parameters
	(assume parameters modelName='user' and fluxStoreName='userStore'):
		1) this.props.clearUser() - unsets the model property variable, ie this.props.user will be set to null
		2) this.props.clearUserError() - unsets the last error that occurred during the previous fetchUser()
				request
		3) this.props.fetchUserError - the error that occurred during the previous fetchUser() request.
		4) this.props.fetchUser(modelId, force) - the function to trigger a fetch of model with id=modelId. The
				force flag will cause the fetch to take place even if one is currently in progress.
		5) this.props.fetchUserCalled() - gets if a previous call to fetchUser() has been made. Useful for
				componentDidUpdate() guards to prevent unnecessary fetch calls.
		6) this.props.isFetchingUser() - returns true if fetching is in progress
		7) this.props.refrectModel(modelId) - trigger a call to fetchUser(modelId, true) with the force
				flag set to true.
		8) this.prpos.user` - the fetched model.
		9) this.prpos.userId` - the ID of the model [being] fetched.

	Lifecycle (assume modelName='user':
		Not fetched: this.props.user is null/undefined and this.props.isFetchingUser() returns false
		Fetching: this.props.isFetchingUser() returns true
		Fetched: this.props.user contains the model instance and this.isFetchingUser() returns false
*/
export default function fetchModelContainer(modelName, collectionPropName, options={}) {
	const { idProp=null, withRef=false } = options;
	const progressStateProp = `${modelName}Fetching`;

	// Helps track hot reloading.
	const version = nextVersion++;

	return function wrapWithContainer(WrappedComponent) {
		class FetchModelContainer extends Component {
			constructor(props, context) {
				super(props, context);

				// Helps track hot reloading.
				this.version = version;

				this.collection = props[collectionPropName];
				this.endpointId = this.collection && this.collection.endpoint.id;
				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;

				this.displayName = getDisplayName(WrappedComponent);

				this.state = {
					isFetching: false,
					error: null,
				};
			}

			componentWillMount() {
				this.checkForCollectionChange(this.props);
				this.clearCache();
			}

			componentDidMount() {
				const modelId = idProp && this.props[idProp];

				this.mounted = true;

				if (modelId && this.modelId != modelId) {
					InteractionManager.runAfterInteractions( () => this.fetchModel(modelId, true) );
				}
			}

			componentWillUnmount() {
				this.mounted = false;
			}

			componentWillReceiveProps(nextProps) {
				this.checkForCollectionChange(nextProps);
			}

			checkForCollectionChange(props) {
				const collection = props[collectionPropName];

				if (collection === this.collection) { return }

				this.collection = collection;

				if (!collection) {
					this.collection = null;
					this.endpointId = null;
					this.clearModel();
				} else {
					const nextModelId = idProp && this.props[idProp];

					 if (this.endpointId !== collection.endpoint.id) {
						// TODO - should the model be refetched?

						this.clearModel();
					}

					this.endpointId = collection.endpoint.id;

					if (idProp && nextModelId != this.modelId) {
						this.clearModel();
						this.clearError();
						InteractionManager.runAfterInteractions(
								() => this.fetchModel(nextModelId, true)
							);
					} else if (this.modelId) {
						this.model = collection.get(this.modelId);
					}
				}
			}

			clearCache() {
				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;
			}

			@autobind
			clearError() {
				if (this.mounted) {
					this.setState({ error: null });
				}
			}

			@autobind
			clearModel() {
				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;

				if (this.mounted) {
					this.setState({
							isFetching: false,
						});
				}
			}

			@autobind
			fetchCalled() {
				return this.modelId || this.startFetchTime;
			}

			@autobind
			fetchModel(modelId, force=false) {
				modelId = modelId || (idProp && this.props[idProp]);

				if ((this.startFetchTime || this.modelId) && !force) { return }

				invariant(this.collection, `Could not find "${collectionPropName}"" in the props of ` +
					`<${this.constructor.displayName}>. Wrap the root component in a storeContainer(), or explicitly ` +
					`pass "${collectionPropName}" collection as a prop to <${this.constructor.displayName}>.`
				)

				const time = Date.now();

				this.model = null;
				this.modelId = modelId;
				this.startFetchTime = time;

				if (this.mounted) {
					this.setState({
							isFetching: true,
							error: null,
						});
				}

				this.collection.find(modelId)
					.then( model => {
							if (this.startFetchTime != time) {
								console.info(
									`fetchModelContainer::fetchModel() - fetch for ${modelName}:${modelId} @${time} ` +
									`superceded by @${this.startFetchTime} - force=${force}`
								);

								return;
							}

							this.startFetchTime = null;
							this.model = model;

							if (this.mounted) {
								this.setState({
										isFetching: false,
									});
							}
						})
					.catch( error => {
						// only report errors for most recent request
						if (this.startFetchTime == time) {
							if (this.mounted) {
								this.setState({
										isFetching: false,
										error
									});
							}

							// remove the timestamp
							this.startFetchTime = null;
						}

						console.warn(
							`fetchModelContainer::fetchModelMixin() - Error find ${modelName}: ` +
							`id=${modelId}, error=${error}`
						);

						if (error.stack) {
							console.warn(error.stack);
						}
					})

			}

			getWrappedInstance() {
				invariant(
						withRef,
						`To access the wrapped instance, you need to specify  { withRef: true } as the fourth `+
							`argument of the fetchModelContainer() call.`
					);

				var wrapped = this.refs.wrappedInstance;

				while(wrapped.refs.wrappedInstance) {
					wrapped = wrapped.refs.wrappedInstance;
				}

				return wrapped;
			}

			@autobind
			isFetching() {
				return this.state.isFetching || !this.mounted;
			}

			mergeProps() {
				return {
					...this.props,
					[`clear${capitalize(modelName)}Error`]: this.clearError,
					[`clear${capitalize(modelName)}`]: this.clearModel,
					[`fetch${capitalize(modelName)}`]: this.fetchModel,
					[`fetch${capitalize(modelName)}Called`]: this.fetchCalled,
					[`isFetching${capitalize(modelName)}`]: this.isFetching,
					[`refetch${capitalize(modelName)}`]: this.refetchModel,
					[modelName]: this.model,
					[`${modelName}Id`]: this.state.modelId,
					[`${modelName}Error`]: this.state.error,
				}
			}

			@autobind
			refetchModel(modelId) {
				this.fetchModel(modelId, true);
			}

			render() {
				const mergedProps = this.mergeProps();

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

		FetchModelContainer.displayName = `FetchModelContainer(${getDisplayName(WrappedComponent)})`
		FetchModelContainer.WrappedComponent = WrappedComponent

		FetchModelContainer.propTypes = {
			[collectionPropName]: PropTypes.object,
		}



		if (process.env.NODE_ENV !== "production") {
			FetchModelContainer.prototype.componentWillUpdate = function componentWillUpdate() {
				if (this.version === version) {
					return
				}

				// We are hot reloading!
				this.version = version
				this.clearCache()
			}


			return hoistStatics(FetchModelContainer, WrappedComponent)
		} else {
			return FetchModelContainer;
		}
	}
}