/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />
declare var require;

import {BaseConnectionConfig, ConnectionConfig} from './BaseConnectionConfig';
import {IConnectionConfig} from './IConnection';
import {Methods} from './Methods';
import {Backend} from './MockConnection';
import {ReadyStates} from './ReadyStates';
import {Request} from './Request';
import {Response} from './Response';
import Rx = require('rx');
import Immutable = require('immutable');

var di = require('di');

/**
 * This function is bound to a single underlying connection mechanism, such as XHR, which could be
 * mocked with dependency injection by replacing the `Backend` binding. For other transports, like
 * JSONP or Node, a separate http function would be created, such as httpJSONP.
 *
 * Ideally, much of the logic used here could be moved out of http and re-used.
 *
 **/
//import {Backend} from './XHRConnection';
export function Http (backend) {
    return function http(config: string|Object) {
        // If just passed in a url, create a fully-qualified config based on base.
        let configMap:Immutable.Map<string,any>;
        if (typeof config === 'string') {
            configMap = Immutable.fromJS({ method: Methods.GET, url: config });
        } else {
            configMap = Immutable.fromJS(config);
        }
        configMap = BaseConnectionConfig.merge(configMap);
        return Rx.Observable.create((observer) => {
            let request = new Request(configMap);
            let connection = backend.createConnection(request);
            connection.send().subscribe(observer);
            return connection.dispose;
        });
    }
}

di.annotate(Http, new di.Inject(Backend));
