/*global CustomEvent*/
import observer from '@cocreate/observer';
import ccfilter from '@cocreate/filter';
import crud from '@cocreate/crud-client';
import render from '@cocreate/render';
import uuid from '@cocreate/uuid';
import {dotNotationToObject} from '@cocreate/utils';

const CoCreateFetch = {
	selector: '[template_id][fetch-collection], [template_id][fetch-collections]',
	items: new Map(),
	initializing: new Map(),

	init: function() {
		let elements =  document.querySelectorAll(this.selector);
		this.initElements(elements);
		this.__initSocketEvent();
		this.__initEvents();
	},
	
	initElements: function(elements){
		for(let element of elements)
			this.initElement(element);
	},
	
	initElement: function(element) {
		let isCollections;
		let collection = element.getAttribute('fetch-collection')
		let name = element.getAttribute('fetch-name')
		if (!element.getAttribute('fetch-collection')) {
			isCollections = element.hasAttribute('fetch-collections');
			if (!isCollections) return;
			// if (isCollections) {
			// 	let request = {}
			// 	crud.readCollections(request);
			// } else return
		}
		
		let initialize = this.initializing.get(element)
		if (!initialize || initialize.collection != collection && initialize.name != name){
			this.initializing.set(element, {collection, name});
		}

		let item_id = element.getAttribute('template_id');
		if (!item_id) return;
		if(/{{\s*([\w\W]+)\s*}}/g.test(item_id))
			return;

		if (item_id == '$auto'){
			item_id = item_id.replace(/\$auto/g, uuid.generate(6));
			element.setAttribute('template_id', item_id);
			let elements = element.querySelectorAll('[template_id="$auto"]');
			for (let el of elements)
				el.setAttribute('template_id', item_id);
		}
		
		let parentEls = element.getAttribute('filter-value');
		if (parentEls == 'parent'){
			let ele = element.parentElement.closest('[filter-value]');
			if (ele) {
				let value = ele.getAttribute('filter-value');
				element.setAttribute('template_id', item_id);
				element.setAttribute('filter-value', value);
			}
		}

		let item = this.items.get(item_id);

		if (!item) {
			let filter = ccfilter.setFilter(element, "template_id", "template");
			if (!filter) return;
			
			if (isCollections) {
				filter.is_collection = true;
				filter.collection = 'collections'
			}
			
			item = {
				el: element,
				...filter,
				templateId: item_id,
			};
			
			this.items.set(item_id, item);

			element.addEventListener("changeFilterInput", function(e) {
				item.filter.startIndex = 0;
				ccfilter.fetchData(item.filter);
			});
			
		} else {
			item.el = element;
			item.collection = element.getAttribute('fetch-collection');
			item.filter.startIndex = 0;
		}
		
		ccfilter.fetchData(item);
	},
	
	__renderElements: function(wrapper, data, type = "data", replaceNode, index) {
		let auto;
		let templateId = wrapper.getAttribute('template_id');

		let template = wrapper.querySelector(`.template[template_id='${templateId}'`);
		if (!template) return;
		
		let renderId = wrapper.getAttribute('render_id');
		if (renderId == '$auto'){
			renderId = renderId.replace(/\$auto/g, uuid.generate(6));
			auto = "true";
			wrapper.setAttribute('render_id', renderId);
		}
		
		let renderData = renderId ? {[renderId] : data} : data;
		
		type = type || "data";
		type = renderId ? `${renderId}.${type}` : type;
		
		let elements, cloneWrapper;
		if (replaceNode)
			elements = [replaceNode];
		else
			cloneWrapper = this.__cloneTemplate(template, templateId, type, renderId, auto);
		
		render.data({
			elements: elements || cloneWrapper.children,
			data: renderData,
		});
		
		if (cloneWrapper) {
			let removeableTemplate = cloneWrapper.querySelector(`.template[template_id="${templateId}"]`);
			if (removeableTemplate) {
				removeableTemplate.remove();
			} else {
				return;
			}

			if (index) {
				let els = wrapper.querySelectorAll(`[templateId="${templateId}"]`)
				if (els[index])
					els[index].insertAdjacentElement('beforebegin', cloneWrapper.firstElementChild);
				else if (els[index - 1])
					els[index - 1].insertAdjacentElement('afterend', cloneWrapper.firstElementChild);
				else
					template.insertAdjacentHTML('beforebegin', cloneWrapper.innerHTML);
			}
			else if (replaceNode)
				wrapper.replaceChild(cloneWrapper.firstElementChild, replaceNode);
			else {
				Array.from(cloneWrapper.children).forEach(child => {
					template.insertAdjacentElement('beforebegin', child)
				});
			}
		}
		var evt = new CustomEvent('fetchedTemplate', { bubbles: true });
		wrapper.dispatchEvent(evt);

	},

	__cloneTemplate: function(clone_node, templateId, type, render_id, auto) {
	
		let itemTemplateDiv = document.createElement(clone_node.parentNode.tagName || 'div');
		let template = clone_node.cloneNode(true);
		template.setAttribute('templateId', templateId);

		if (!type) type = "data";
		if (!template.getAttribute('render-array')) {
			template.setAttribute('render-array', type);
		}
		if (!template.getAttribute('render-key') && render_id) {
			template.setAttribute('render-key', render_id);
		}
		if (!template.getAttribute('document_id')) {
			template.setAttribute('document_id', '{{data._id}}');
		}
		if (render_id) {
			template = template.outerHTML.replace(/\$auto/g, render_id);
			itemTemplateDiv.innerHTML = template;
		} else {
			template = template.outerHTML;
			itemTemplateDiv.innerHTML = template;
		}
		return itemTemplateDiv;
	},
	
	__removeAllElements: function(wrapper) {
		let item_id = wrapper.getAttribute('template_id');
		let elements = wrapper.querySelectorAll("[templateId='" + item_id + "']");
		elements.forEach((el) => el.remove());
	},

	__initSocketEvent: function() {
		const self = this;
		crud.listen('readDocuments', function(data) {
			self.__fetchedData(data);
		});
		crud.listen('readCollections', function(data) {
			self.__fetchedData(data);
		});
		
		crud.listen('createDocument', function(data) {
			self.__addElements(data);
		});
		
		crud.listen('updateDocument', function(data) {
			self.__addElements(data);
		});
		
		crud.listen('deleteDocument', function(data) {
			self.__removeElements(data);
		});

		crud.listen('createCollection', function(data) {
			self.__collections(data)
		});
		
		crud.listen('updateCollection', function(data) {
			self.__collections(data, 'updateCollection')
		});
		
		crud.listen('deleteCollection', function(data) {
			self.__collections(data, 'deleteCollection')
		});
	},

	__collections: async function(data, action) {
		data['document_id'] = data.collection
		data['data'] = {}
		data.data['_id'] = data.collection
		data.data['name'] = data.collection
		data.collection = 'collections'
		if (action == 'updateCollection') {
			data.data['_id'] = data.target
			data.data['name'] = data.target
			this.__addElements(data)
		}
		else if (action == 'deleteCollection')
			this.__removeElements(data)
		else
			this.__addElements(data)
	},

	__addElements: async function(data) {
		let Data, isRendered;
		if (Array.isArray(data.data)){
			Data = data.data[0];
			if (!Data._id) return;
		} else {
			Data = data.data;
			if (!data.document_id) return;
		}
		
		let collection = data['collection'];
		if(collection == 'crdt-transactions') return;

		for (let item of this.items.values()) {
			const {filter} = item;
			let itemData;
			
			if (filter.collection === collection && !item.el.getAttribute('fetch-name') && item.documentList) {
				let render_data = {...data};
				let document_id = item.documentList.get(data.document_id);
				if(collection == 'collections'){
					itemData = Data;
					render_data.data = [itemData];
					if(document_id) {
						item.documentList.delete(data.document_id);
					}
				}
				else if(!document_id){
					let documentData = await crud.readDocument({collection, document_id: data.document_id});
					itemData = documentData.data;
					render_data.data = [itemData];
				}
				else {
					itemData = {...document_id, ...Data};
					render_data.data = [itemData];
					isRendered = true;
				}
				
				let orderField = item.el.getAttribute('filter-order-name');
				let orderType = item.el.getAttribute('filter-order-type');
				let orderValueType = item.el.getAttribute('filter-value-type');
				let isFilter = ccfilter.queryData(itemData, filter.filters);
				if(!isFilter && document_id){
					item.documentList.delete(data.document_id);
					item.filter.startIndex -= 1;
					let el = item.el.querySelector("[templateId='" + item.templateId + "'][document_id='" + data.document_id + "']");
					if (el) {
						el.remove();
						item.startIndex--;
					}
				} else if(isFilter) {
					let index;
					let _id = Data._id || data.document_id
					item.documentList.set(_id, itemData);
					if (orderField) {
						let sort;
						if (orderType == 'desc') {
							if (orderValueType == 'number')
								sort = [...item.documentList.entries()].sort((a, b) => 
									b[1][orderField] - a[1][orderField]
								);
							else
								sort = [...item.documentList.entries()].sort((a, b) => 
									b[1][orderField].localeCompare(a[1][orderField])
								);
						} else {
							if (orderValueType == 'number')
								sort = [...item.documentList.entries()].sort((a, b) => 
									a[1][orderField] - b[1][orderField]
								);
							else
								sort = [...item.documentList.entries()].sort((a, b) => 
									a[1][orderField].localeCompare(b[1][orderField])
								);
							
						}
						index = sort.findIndex(x => x[0] === _id);	
					}	

					if(isFilter && !document_id){
						item.filter.startIndex += 1;
						this.__renderElements(item.el, render_data, '', '', index);
					}
					else if( isFilter && document_id) {
						let replaceNode = item.el.querySelector("[templateId='" + item.templateId + "'][document_id='" + data.document_id + "']");
						if (index && replaceNode){
							replaceNode.remove();
							replaceNode = '';
						}
						if (isRendered) {
							render_data.data = dotNotationToObject(Data)
						}
						this.__renderElements(item.el, render_data, '', replaceNode, index);
					}
				}
			}
		}
	},
	
	__removeElements: function(data) {
		let collection = data['collection'];
		let document_id = data['document_id'];
		
		for (let item of this.items.values()) {
			if (item.filter.collection == collection) {
				var tmpId = item.el.getAttribute('template_id');
				var els = item.el.querySelectorAll("[templateId='" + tmpId + "'][document_id='" + document_id + "']");
				for (let j = 0; j < els.length; j++) {
					els[j].remove();
					item.startIndex--;
				}
			}
		}
	},
	
	__fetchedData: function(data) {
		if(data.collection == 'crdt-transactions')
			return;
		let item_id = data.filter.id;
		let item = this.items.get(item_id);
		if (item) {
			item.filter.startIndex += data['data'].length;
			let fetch_name = item.el.getAttribute('fetch-name');
			if (fetch_name) {
				data = data.data[0];
			}
			
			if (data) {
				if (fetch_name) {
					this.__removeAllElements(item.el);
				} else {
					if (data.filter && data.filter.startIndex === 0) {
						if (data.collection == 'collections')
							item.documentList = new Map(data.data.map(key => [key.name, key]));
						else
							item.documentList = new Map(data.data.map(key => [key._id, key]));
						this.__removeAllElements(item.el);
					} else {
						for (let documentItem of data.data)
							item.documentList.set(documentItem._id, documentItem);
					}
				}
				this.__renderElements(item.el, data, fetch_name);
			}
			this.initializing.delete(item.el)
		}
	},

	// dnd event listner to update document positions and orders
	__initEvents: function() {
		const self = this;
		window.addEventListener('dndsuccess', function(e) {
			const {dropedEl, dragedEl} = e.detail;
			let dragedElTemplatId = dragedEl.getAttribute('templateid');
			let dragElTemplate = document.querySelector(`[fetch-collection][template_id='${dragedElTemplatId}']`);
			if (!dropedEl.parentElement) return;
			let dropElTemplate = dropedEl.parentElement.closest('[template_id][fetch-collection]');

			if (!dragElTemplate || !dropElTemplate) {
				return;
			}
			
			if (!dragElTemplate.isSameNode(dropElTemplate)) {
				//. save template id
				self.updateParentTemplateOfChild(dropElTemplate, dragedEl);
				
				//. reordering
				self.reorderChildrenOfTemplate(dragElTemplate);
				self.reorderChildrenOfTemplate(dropElTemplate);
			} else {
				self.reorderChildrenOfTemplate(dropElTemplate);
			}
		});
	},

	// changes position of documents
	updateParentTemplateOfChild: function(template, element) {
		const name = template.getAttribute('filter-name');
		const value = template.getAttribute('filter-value');
		const operator = template.getAttribute('filter-operator');
		if (!name || operator != "$eq") return;

		crud.updateDocument({
			collection: template.getAttribute('fetch-collection'), 
			document_id: element.getAttribute('document_id'), 
			data: {
				[name]: value	
			},
			broadcast: false,
			broadcastSender: false
		});
	},
	
	// changes position of documents
	reorderChildrenOfTemplate: function (template) {
		const template_id = template.getAttribute('template_id');
		let item = this.items.get(template_id)
		const orderField = item.filter.orders[0].name

		if (!orderField || !template_id) {
			return;
		}
		const children = template.querySelectorAll(`[templateid="${template_id}"][document_id]:not(.template)`);
		
		const coff = item.filter.orders[0].type
		children.forEach((item, index) => {
			if (item.classList.contains('template')) {
				return;
			}
			crud.updateDocument({
				collection: template.getAttribute('fetch-collection'), 
				document_id: item.getAttribute('document_id'), 
				data: {
					[orderField]: index * coff	
				},
				broadcast: false,
				broadcastSender: false
			});
		});
	}
};

observer.init({ 
	name: 'CoCreateFetchObserver', 
	observe: ['attributes'],
	attributeName: ['fetch-collections', 'fetch-collection', 'fetch-name'],
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target);
	}
});

observer.init({ 
	name: 'CoCreateFetchInit', 
	observe: ['addedNodes'],
	target: '[fetch-collection], [fetch-collections]',
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target);
	}
});

CoCreateFetch.init();

export default CoCreateFetch;
