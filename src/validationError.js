
var _errorClass = "validation-error";

export function getValidationError(bind, model) {
	return model.$$().validationErrors && model.$$().validationErrors().find( e => {
		return e.path == bind;
	})
}

export function setValidationErrorClass(className) {
	_errorClass = className;
}

export function validationErrorClass() {
	return _errorClass;
}