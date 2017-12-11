
function noop() {}

export default class TransientManager {
	constructor(name, onTransChange=noop) {
		this.name = name;
		this.onTransChange = onTransChange;
	}

	lock(trans) {
		if (trans === this.trans) { return this.transId }

		// unlock old transient (if exists)
		this.release();

		if (trans) {
			this.trans = trans;
			this.transLock = trans.lock(this.name);
			this.transId = trans.id;

			this.onTransChange(this.transId, trans);
		}
	}

	object() {
		const transObj = this.trans && this.trans.isActive() && this.trans._();

		return transObj && transObj.data;
	}

	release() {
		if (this.trans) {
			this.transLock.release();

			this.trans = null;
			this.transLock = null;
			this.transId = null;

			this.onTransChange(null, null);
		}
	}
}
