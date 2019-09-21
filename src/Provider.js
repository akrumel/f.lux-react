// Borrowed-from/Based-on Redux Provider class (https://github.com/reactjs/react-redux/blob/master/src/components/Provider.js)

import PropTypes from 'prop-types';
import React from "react";
import ReactFluxContext from "./Context";


export default function Provider({ store, context, children }) {
	const Context = context || ReactFluxContext;

	return <Context.Provider value={store}>{children}</Context.Provider>
}


Provider.propTypes = {
	store: PropTypes.object.isRequired,
	children: PropTypes.element.isRequired,
	context: PropTypes.object,
}

