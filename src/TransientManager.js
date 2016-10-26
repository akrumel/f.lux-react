
export default class TransientManager {
	constructor(name, onTransChange) {
		this.name = name;
		this.onTransChange = onTransChange;
	}

	lock(trans) {
		if (trans === this.trans) { return this.transId }

		// unlock old accounts (if exists)
		this.release();

		if (trans) {
			this.trans = trans;
			this.transLock = trans.lock(this.name);
			this.transId = trans.id;

			this.onTransChange(this.transId, trans);
		}
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
