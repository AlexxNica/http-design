/// <reference path="../node_modules/rx/ts/rx.all.d.ts" />
/// <reference path="shared-declarations.d.ts" />
/// <reference path="../jasmine.d.ts" />

import {Http} from '../public/http';
import {Backend, Connection} from '../public/MockConnection';
import {BaseConnectionConfig, ConnectionConfig} from '../public/BaseConnectionConfig';
import {Methods} from '../public/Methods';
import {Response} from '../public/Response';
import {Request} from '../public/Request';
import {ReadyStates} from '../public/ReadyStates';

var VirtualTimeScheduler = require('../node_modules/rx/dist/rx.virtualtime.js');
var Rx = require('../node_modules/rx/dist/rx.testing.js');
var di = require('di');

describe('Http', () => {
    let baseResponse;
    let backend;
    let injector;
    let http;

    beforeEach(() => {
        injector = new di.Injector();
        backend = injector.get(Backend);
        http = injector.get(Http);
        baseResponse = new Response({responseText:'base response'});
    });

    afterEach(() => {
        backend.verifyNoPendingRequests();
    });

    it('should perform a get request for given url if only passed a string', () => {
        let url = 'http://basic.connection';
        let text;
        let connection;
        http(url).subscribe((res: Response) => {
            text = res.responseText;
        });
        backend.connections.subscribe((c) => connection = c);
        connection.mockRespond(baseResponse);
        expect(text).toBe('base response');
    });


    it('should perform a get request for given url if passed a ConnectionConfig instance', () => {
        let url = 'http://basic.connection';
        let config = new ConnectionConfig(Methods.GET, url);
        let text;
        let connection;

        http(config).subscribe((res: Response) => {
            text = res.responseText;
        });
        backend.connections.subscribe((c) => connection = c);
        connection.mockRespond(baseResponse);
        expect(text).toBe('base response');
    });


    it('should perform a get request for given url if passed a dictionary', () => {
        let url = 'http://basic.connection';
        let connection;
        let config = {
            method: Methods.GET,
            url: url
        };
        let text;
        http(config).subscribe((res: Response) => {
            text = res.responseText;
        });
        backend.connections.subscribe((c) => connection = c);
        connection.mockRespond(baseResponse);
        expect(text).toBe('base response');
    });

    describe('.dispose()', () => {
        it('should abort the connection if disposed', () => {
            let url = 'http://kill.me';
            let count = 0;
            let connection;
            let nextSpy = jasmine.createSpy('next');
            http(url).subscribe(nextSpy).dispose();
            backend.connections.
                do(c => connection = c).
                filter((c) => c.readyState === ReadyStates.CANCELLED).
                subscribe(c => count++);
            expect(count).toBe(1);

            expect(() => {
                connection.mockRespond(new Response({}));
            }).toThrow(new Error('Connection has already been resolved'));
            expect(nextSpy).not.toHaveBeenCalled();
        });
    });


    xdescribe('downloadObserver', () => {

        it('should report download progress to the observer', () => {
            let url = 'http://chunk.connection';
            let chunks = 0;
            let config = {
                url: url,
                downloadObserver: Rx.Observer.create(() => {
                    chunks++;
                })
            }
            http(config).publish().connect();
            let connections = backend.getConnectionsByUrl(url);
            let connection = connections[0];
            let response = new Response({});
            response.totalBytes = 100;
            response.bytesLoaded = 0;
            for (let i = 1; i <= 5; i++) {
                response.bytesLoaded = i * 20;
                connection.mockDownload(response);
            }

            expect(chunks).toBe(5);
        });

        it('should call complete when all bytes have been downloaded', () => {
            let url = 'htp://chunk.connection';
            let complete = jasmine.createSpy('complete');
            let config = {
                url: url,
                downloadObserver: Rx.Observer.create(() => { }, () => { }, complete)
            }
            http(config).publish().connect();
            let connections = backend.getConnectionsByUrl(url);
            let connection = connections[0];
            let response = new Response({});
            response.totalBytes = 100;
            response.bytesLoaded = 100;
            expect(complete).not.toHaveBeenCalled();
            connection.mockDownload(response);
            expect(complete).toHaveBeenCalled();
            //TODO: assert call onNext as well
        });
    });

    xdescribe('uploadObserver', () => {
    });

    xdescribe('stateObserver', () => {
    });


    xdescribe('Response', () => {
    });


    describe('interval', () => {
        it('should create new connection at specified interval', (done) => {
            //TODO: Use testscheduler
            let url = 'http://repeatable';
            let count = 0;

            backend.connections.subscribe(() => count++);

            let subscription = Rx.Observable.interval(250).
                map(() => url).
                do((res) => {
                    if (count >= 3) {
                        subscription.dispose();
                        done();
                    }
                }).
                flatMap(http).
                subscribe();
        });
    });


    describe('retry', () => {
        it('should try the connection specified number of times on errors', () => {
            let url = 'http://flaky.url';
            let count = 0;
            let successSpy = jasmine.createSpy('success');
            let errorSpy = jasmine.createSpy('error');
            let response = new Response({reponseText: 'finally!'})
            let completeSpy = jasmine.createSpy('complete');
            http(url).
                retry(2).
                subscribe(successSpy, errorSpy, completeSpy);
            backend.connections.subscribe(c => {
                if (count === 0) {
                    count++;
                    c.mockError();
                } else {
                    c.mockRespond(response);
                }

            });

            expect(errorSpy.calls.count()).toBe(0);
            expect(successSpy.calls.count()).toBe(1);
            expect(completeSpy).toHaveBeenCalled();
        });


        it('should retry intelligently when provided a function', () => {
            let url = 'http://flaky.url';
            let count = 0;
            let connection:Connection;
            let successSpy = jasmine.createSpy('success');
            let errorSpy = jasmine.createSpy('error');
            let response = new Response({reponseText: 'finally!'})
            let completeSpy = jasmine.createSpy('complete');
            http(url).
              retryWhen(function(errors) {
                return errors.map(e => {
                  if (e.statusCode > 400 && e.statusCode < 500) {
                    return e;
                  } else {
                    throw e;
                  }
                });
              }).
                subscribe(successSpy, errorSpy, completeSpy);
            backend.connections.subscribe(c => {
                console.log('new connection', c);
                connection = c;
            });

            connection.mockError(new Response({statusCode: 404}));
            expect(successSpy).not.toHaveBeenCalled();
            expect(errorSpy).not.toHaveBeenCalled();

            connection.mockError(new Response({statusCode: 500}));
            expect(successSpy).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalled();

            backend.resolveAllConnections();
        });
    });


    /*xdescribe('caching', () => {

        it('should set response to cache setter', () => {
            let req, res;
            let url = 'http://cache.me.plz';

            let config = BaseConnectionConfig.merge({
                url: url,
                cacheSetter: jasmine.createSpy()
            });
            let request = new Request(config);
            let response = new Response({});
            http(config).subscribe(() => {
                expect(config.cacheSetter).toHaveBeenCalledWith(request, response);
            });
            let connection = backend.getConnectionsByUrl(url)[0];
            connection.mockRespond(response);
        });


        it('should try to load response from cache', () => {
            let url = 'http://cache.me.please';
            let response = new Response({});
            let subject: Rx.Subject<Response> = new Rx.Subject();
            let config = {
                url: url,
                cacheGetter: (req) => subject
            };
            let finalRes;
            http(config).
                subscribe(res => finalRes = res);
            subject.onNext(response);
            expect(finalRes).toBe(response);
        });


        it('should set connection to done after response received', () => {
            let url = 'http://cache.me.please';
            let response = new Response({});
            let subject: Rx.Subject<Response> = new Rx.Subject();
            let config = {
                url: url,
                cacheGetter: (req) => subject
            };
            let finalRes;
            http(config).
                subscribe(res => finalRes = res);
            let connection = backend.getConnectionsByUrl(url)[0];
            expect(connection.readyState).toBe(1);
            subject.onNext(response);
            expect(connection.readyState).toBe(4);
        });
    });


    xdescribe('transformation', () => {

        it('should apply request transformations prior to sending', () => {
            let url = 'http://transform.me';
            let config = {
                url: url,
                requestTransformer: (reqs:Rx.Observable<Request>):Rx.Observable<Request> => {
                    return reqs.map(req => new Request(url, 'somedata'));
                }
            };
            http(config).publish().connect();
            let connection = backend.getConnectionsByUrl(url)[0];
            expect(connection.mockSends[0].data).toBe('somedata');
        });


        it('should apply response transformations before publishing', () => {
            let url = 'http://transform.me';
            let config = {
                url: url,
                responseTransformer: (responses:Rx.Observable<Response>):Rx.Observable<Response> => {
                    return responses.map(response => new Response({responseText:'somedata'}));
                }
            };
            let txt;
            http(config).subscribe(res => {
                txt = res.responseText;
            });
            let connection = backend.getConnectionsByUrl(url)[0];
            connection.mockRespond(new Response({responseText:'no data'}));
            expect(txt).toBe('somedata');
        });
    });


    xdescribe('data types', () => {

    });*/
});


xdescribe('Connection', () => {
    describe('.cancel()', () => {

    });
});


xdescribe('BaseConnectionConfig', () => {
    it('should create a new object when setting new resues', () => {
    });
});
