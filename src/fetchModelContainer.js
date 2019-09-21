import PropTypes from 'prop-types';
import { Component, createElement } from "react";
import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";

import InteractionManager from "./InteractionManager";
import ReactFluxContext from "./Context";


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
	const { idProp=null, refresh=false, withRef=false } = options;
	const progressStateProp = `${modelName}Fetching`;

	// Helps track hot reloading.
	const version = nextVersion++;

	return function wrapWithContainer(WrappedComponent) {
		class FetchModelContainer extends Component {
			static contextType = ReactFluxContext;

			constructor(props, context) {
				super(props, context);

				// Helps track hot reloading.
				this.version = version;

				this.store = this.context;
				this.collection = props[collectionPropName];
				this.endpointId = this.collection && this.collection.endpoint.id;
				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;
				this.mounted = true;
				this.displayName = getDisplayName(WrappedComponent);
				this.refreshModel = refresh;

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
				const modelId = this.idPropValue();

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

			idPropValue() {
				return typeof idProp === 'function'
					?idProp(this.store._, this.props, this.store)
					:idProp && this.props[idProp];
			}

			checkForCollectionChange(props) {
				const collection = props[collectionPropName];
				const nextModelId = this.idPropValue();

				if (collection === this.collection && nextModelId === this.modelId) { return }

				this.collection = collection;

				if (!collection) {
					this.collection = null;
					this.endpointId = null;
					this.clearModel();
				} else {
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

			clearError = () => {
				if (this.mounted) {
					this.setState({ error: null });
				}
			}

			clearModel = () => {
				this.model = null;
				this.modelId = null;
				this.startFetchTime = null;

				if (this.mounted) {
					this.setState({
							isFetching: false,
						});
				}
			}

			fetchCalled = () => {
				return this.modelId || this.startFetchTime;
			}

			fetchModel = (modelId, force=false) => {
				const time = Date.now();

				modelId = modelId || this.idPropValue();

				if (!this.collection || ((this.startFetchTime || this.modelId == modelId) && !force)) { return }

				this.model = null;
				this.modelId = modelId;
				this.startFetchTime = time;

				if (this.mounted) {
					this.setState({
							isFetching: true,
							error: null,
						});
				}

				this.collection.find(modelId, this.refreshModel)
					.then( model => {
							if (this.startFetchTime != time) {
								// console.info(
								// 	`fetchModelContainer::fetchModel() - fetch for ${modelName}:${modelId} @${time} ` +
								// 	`superceded by @${this.startFetchTime} - force=${force}`
								// );

								return;
							}

							// reset the refresh flag
							this.refreshModel = false;

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
							// remove the timestamp
							this.startFetchTime = null;

							if (this.mounted) {
								this.setState({
										isFetching: false,
										error
									});
							}
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

			isFetching = () => {
				return (this.state.isFetching || this.startFetchTime) && this.mounted;
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
					[`fetch${capitalize(modelName)}Id`]: this.modelId,
					[modelName]: this.model,
					[`${modelName}Id`]: this.modelId,
					[`${modelName}Error`]: this.state.error,
				}
			}

			refetchModel = () => {
				this.fetchModel(this.modelId, true);
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