import isString from "lodash.isstring";
import result from "lodash.result";


export default function baseModel(model, path) {
	if (path.indexOf('.') === -1) {
		return {
			key: path,
			target: model,
		}
	}

	var lastDotIdx = path.lastIndexOf('.');
	var basePath = path.substring(0, lastDotIdx);

	return {
		key: path.substring(lastDotIdx + 1),
		target: result(model, basePath),
	}
}
