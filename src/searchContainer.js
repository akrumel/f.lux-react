import isEqual from "lodash.isequal";
import PropTypes from 'prop-types';
import { Component, createElement } from "react";
import hoistStatics from "hoist-non-react-statics";
import invariant from "invariant";

import InteractionManager from "./InteractionManager";


// http://stackoverflow.com/questions/1026069/capitalize-the-first-letter-of-string-in-javascript
function capitalize(s) {
	return s && s[0].toUpperCase() + s.slice(1);
}

function filterChanged(f1, f2) {
	return !isEqual(f1, f2);
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
		* modelsName - models will be stored in a property variable named `modelsName`. For modelsName of "foo"
				the models can be accessed using this.props.foo (required)
		* collectionPropName - property name where the f.lux collection can be found on the properties. This
				container does not utilize the context. (required)
		* options
			- `searchOn` - function taking a QueryBuilder instantiated using the collection endpoint that
				configures it for the search and must have the form: fn(qb, props) (required)
			- `find` - function taking the collection to search for matching models. Returning a non-array will
				cause a search to take place (optional)
			- `withRef` - `true` specifies the ref="wrappedInstance" for the wrapped element
				(default=false).

	The container sets up the following functions and values on the proeprties object based on the two parameters
	(assume parameters modelsName='users' and fluxStoreName='userStore'):
		1) this.props.clearUsers() - unsets the model property variable, ie this.props.user will be set to null
		2) this.props.clearUsersError() - unsets the last error that occurred during the previous searchUser()
				request
		3) this.props.searchUsersError - the error that occurred during the previous searchUser() request.
		4) this.props.searchUsers(modelId, force) - the function to trigger a search of model with id=modelId. The
				force flag will cause the search to take place even if one is currently in progress.
		5) this.props.searchUsersCalled() - gets if a previous call to searchUser() has been made. Useful for
				componentDidUpdate() guards to prevent unnecessary search calls.
		6) this.props.isSearchingUsers() - returns true if searching is in progress
		7) this.props.researchModels() - trigger a call to searchUsers(true) with the force
				flag set to true.
		8) this.prpos.users` - the searched models.

	Lifecycle (assume modelsName='user':
		Not searched: this.props.user is null/undefined and this.props.isSearchingUser() returns false
		searching: this.props.isSearchingUser() returns true
		Searched: this.props.user contains the model instance and this.isSearchingUser() returns false

	Example:
		const Comp = storeContainer(mapShadowToProps)(
		searchContainer(
			"accountList",
			"accountLists",
			{
				find(alCollection, props) {
					const model = alCollection.findModel( m => m.list_def_id === props.list_def_id);

					return model ?[model] :null;
				},
				searchOn(qb, props) {
					qb.equals("list_def_id", props.list_def_id)
				},
				single: true,
			}
		)(UiComp)
);

*/
export default function searchContainer(modelsName, collectionPropName, options={}) {
	const { find, searchOn, single=false, withRef=false } = options;
	const progressStateProp = `${modelsName}Searching`;

	// Helps track hot reloading.
	const version = nextVersion++;

	return function wrapWithContainer(WrappedComponent) {
		class SearchContainer extends Component {
			constructor(props, context) {
				super(props, context);

				// Helps track hot reloading.
				this.version = version;

				this.collection = props[collectionPropName];
				this.endpointId = this.collection && this.collection.endpoint.id;
				this.models = null;
				this.filter = null;
				this.startSearchTime = null;
				this.mounted = true;
				this.displayName = getDisplayName(WrappedComponent);

				this.state = {
					isSearching: false,
					error: null,
				};
			}

			componentDidMount() {
				this.searchModels();
			}

			componentWillUnmount() {
				this.mounted = false;
			}

			componentWillReceiveProps(nextProps) {
				this._checkForCollectionChange(nextProps);
			}

			clearError = () => {
				if (this.mounted) {
					this.setState({ error: null });
				}
			}

			clearModels = () => {
				this.models = null;
				this.filter = null;
				this.startSearchTime = null;

				if (this.mounted) {
					this.setState({
						isSearching: false,
					});
				}
			}

			searchCalled = () => {
				return this.filter || this.startSearchTime;
			}

			searchModels = (force=false) => {
				if ((this.startSearchTime || isEqual(filter, this.filter)) && !force) { return }

				invariant(this.collection, `Could not find "${collectionPropName}"" in the props of ` +
					`<${this.constructor.displayName}>. Wrap the root component in a storeContainer(), or explicitly ` +
					`pass "${collectionPropName}" collection as a prop to <${this.constructor.displayName}>.`
				)

				const time = Date.now();
				const filter = this.collection.endpoint.queryBuilder();

				searchOn(filter, this.props);

				this.models = null;
				this.filter = filter;
				this.startSearchTime = time;

				if (this.mounted) {
					this.setState({
						isSearching: true,
						error: null,
					});
				}

				if (find) {
					const models = find(this.collection, this.props);

					if (Array.isArray(models)) {
						this.startSearchTime = null;

						this.models = single ?models[0] :models;
						this.mounted && this.setState({ isSearching: false });

						return;
					}
				}

				this.collection.search(filter)
					.then( models => {
							if (this.startSearchTime != time) {
								console.info(
									`searchModelContainer::searchModels() - search for ${modelsName} @${time} ` +
									`superceded by @${this.startSearchTime} - force=${force}`
								);

								return;
							}

							this.startSearchTime = null;
							this.models = single
								?models[0]
								:models;

							if (this.mounted) {
								this.setState({
									isSearching: false,
								});
							}
						})
					.catch( error => {
						// only report errors for most recent request
						if (this.startSearchTime == time) {
							// remove the timestamp
							this.startSearchTime = null;

							if (this.mounted) {
								this.setState({
									isSearching: false,
									error
								});
							}
						}

						console.warn(`searchModelContainer::searchModels() - Error find ${modelsName}: ${error}`);

						if (error.stack) {
							console.warn(error.stack);
						}
					})
			}

			getWrappedInstance() {
				invariant(
						withRef,
						`To access the wrapped instance, you need to specify  { withRef: true } as the fourth `+
							`argument of the searchModelContainer() call.`
					);

				var wrapped = this.refs.wrappedInstance;

				while(wrapped.refs.wrappedInstance) {
					wrapped = wrapped.refs.wrappedInstance;
				}

				return wrapped;
			}

			isSearching = () => {
				return (this.state.isSearching || this.startSearchTime) && this.mounted;
			}

			researchModels = () => {
				this.searchModels(true);
			}

			render() {
				const mergedProps = this._mergeProps();

				if (withRef) {
					return this.renderedElement = createElement(WrappedComponent, {
							...mergedProps,
							ref: 'wrappedInstance'
						});
				} else {
					return this.renderedElement = createElement(WrappedComponent, mergedProps);
				}
			}

			_checkForCollectionChange(props) {
				const collection = props[collectionPropName];

				if (collection === this.collection) { return }

				this.collection = collection;

				if (!collection) {
					this.collection = null;
					this.endpointId = null;
					this.clearModels();
				} else {
					const nextFilter = collection.endpoint.queryBuilder();

					searchOn(nextFilter, props);

					if (this.endpointId !== collection.endpoint.id || filterChanged(nextFilter, this.filter)) {
						this.endpointId = collection.endpoint.id;

						this.clearError();
						this.clearModels();
						this.searchModels(true);
					}
				}
			}

			_clearCache() {
				this.models = null;
				this.filter = null;
				this.startSearchTime = null;
			}

			_mergeProps() {
				return {
					...this.props,
					[`clear${capitalize(modelsName)}Error`]: this.clearError,
					[`clear${capitalize(modelsName)}`]: this.clearModels,
					[`search${capitalize(modelsName)}`]: this.searchModels,
					[`search${capitalize(modelsName)}Called`]: this.searchCalled,
					[`isSearching${capitalize(modelsName)}`]: this.isSearching,
					[`research${capitalize(modelsName)}`]: this.researchModels,
					[modelsName]: this.models,
					[`${modelsName}Error`]: this.state.error,
				}
			}
		}

		SearchContainer.displayName = `SearchContainer(${getDisplayName(WrappedComponent)})`
		SearchContainer.WrappedComponent = WrappedComponent

		SearchContainer.propTypes = {
			[collectionPropName]: PropTypes.object,
		}


		if (process.env.NODE_ENV !== "production") {
			SearchContainer.prototype.componentWillUpdate = function componentWillUpdate() {
				if (this.version === version) {
					return
				}

				// We are hot reloading!
				this.version = version
				this._clearCache()
			}


			return hoistStatics(SearchContainer, WrappedComponent)
		} else {
			return SearchContainer;
		}
	}
}