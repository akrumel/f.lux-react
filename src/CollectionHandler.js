import autobind from "autobind-decorator";
import invariant from "invariant";

import { Store } from "f.lux";

import InteractionManager from "./InteractionManager";


export default class CollectionHandler {
	constructor(container, collectionPropName, page, resyncOnInit) {
		this.container = container;
		this.collectionPropName = collectionPropName;
		this.page = page;
		this.resyncOnInit = resyncOnInit;

		this.errorStateName = `${ collectionPropName }Error`
		this.restoredStateName = `${ collectionPropName }Restored`
	}

	get collection() {
		return this.props[this.collectionPropName];
	}

	get endpointId() {
		const { collection } = this;

		return 	collection && collection.endpoint && collection.endpoint.id;
	}

	get error() {
		return this.container.state[this.errorStateName];
	}

	get props() {
		return this.container.props;
	}

	get restored() {
		return this.container.state[this.restoredStateName];
	}

	init() {
		const { collection, resyncOnInit } = this;

		this.checkForCollectionChange();

		if (collection && collection.isConnected()) {
			if (!this.syncCalled()) {
				this.sync();
			} else if (resyncOnInit) {
				this.resync();
			}
		}
	}

	checkForCollectionChange(props=this.props) {
		const { collectionPropName, collection: currCollection, endpointId: currEpId, error, restored } = this;
		const nextCollection = props[collectionPropName];
		const nextEpId = nextCollection && nextCollection.endpoint && nextCollection.endpoint.id;

		if (nextCollection === currCollection) { return }

		// NOTE: this.collection is still currCollection NOT nextCollection
		if (!nextCollection) {
			this.setError(null);
		} else {
			 if (currEpId !== nextEpId) {
				this.clearErrorAndResync(nextCollection);
			}

			if (nextCollection.isConnected() && !this.syncCalled(nextCollection) && !error && !restored) {
				this._syncCollection(nextCollection);
			} else if (error && (nextCollection.synced ||
					(currCollection && nextCollection.nextOffset !== currCollection.nextOffset)))
			{
				this.setError(null);
			}
		}
	}

	@autobind
	clearErrorAndResync(resync, collection=this.collection) {
		if (!this.error) { return }

		this.setState(
			{ [this.errorStateName]: null },
			() => {
					if (this.resyncOnInit) {
						this._syncCollection(collection);
					}
				}
			);
	}

	clearState() {
		const { errorStateName, restoredStateName } = this;

		this.setState({
			[errorStateName]: null,
			[restoredStateName]: false
		})
	}

	@autobind
	fetchError(error) {
		if (this.container.mounted) {
			this.setError(error);
		}
	}

	@autobind
	restoreOnError(error) {
		if (this.collection.restored) {
			if (this.container.mounted) {
				this.setRestored();
			}
		} else {
			return Store.reject(error);
		}
	}

	resync(collection=this.collection) {
		const { collectionPropName, container } = this;

		invariant(collection, `Could not find "${collectionPropName}" in the props of ` +
			`<${container.constructor.displayName}>. Either wrap the root component in a storeContainer(), or ` +
			`explicitly pass "${collectionPropName}" as a prop to <${container.constructor.displayName}>.`
		)

		return collection.resync()
			.catch( error => this.restoreOnError(error) )
			.catch( error => this.fetchError(error) );
	}

	setError(error) {
		const { container, errorStateName } = this;


		this.setState({ [errorStateName]: error });
	}

	setRestored() {
		const { container, restoredStateName } = this;

		this.setState({ [restoredStateName]: true });
	}

	setState(state, cb) {
		const { container } = this;

		if (container.mounted) {
			container.setState(state, cb);
		}
	}

	@autobind
	sync(mergeOp) {
		this._syncCollection(this.collection, mergeOp);
	}

	syncCalled(collection=this.collection) {
		const { page } = this;

		return collection && (
				(collection.fetching || collection.synced) ||
				(page && (collection.paging || collection.nextOffset != 0))
			);
	}

	_syncCollection(collection, mergeOp) {
		InteractionManager.runAfterInteractions( () => {
			const { collectionPropName, container, page } = this;

			if (!collection || !collection.isConnected() || this.syncCalled(collection) || collection.restoring) {
				return
			}

			invariant(collection, `Could not find "${collectionPropName}" in the props of ` +
				`<${container.constructor.displayName}>. Either wrap the root component in a storeContainer(), or ` +
				`explicitly pass "${collectionPropName}" as a prop to <${container.constructor.displayName}>.`
			)

			this.clearState();

			if (page) {
				if (!collection.fetching && !collection.paging) {
					collection.fetchNext(mergeOp)
						.catch( error => this.restoreOnError(error) )
						.catch( error => this.fetchError(error) );
				}
			} else {
				collection.fetch(null, mergeOp)
					.catch( error => this.restoreOnError(error) )
					.catch( error => this.fetchError(error) );
			}
		});
	}
}
