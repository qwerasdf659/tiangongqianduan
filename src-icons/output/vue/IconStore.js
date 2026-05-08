import { defineComponent, h } from 'vue';

export const IconStore = defineComponent({
  name: 'IconStore',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M832 192H192c-35.3 0-64 28.7-64 64v512c0 35.3 28.7 64 64 64h640c35.3 0 64-28.7 64-64V256c0-35.3-28.7-64-64-64zm-192 384H384V448h256v128zM192 320h640v64H192v-64z", "fillRule": "evenodd"})
      ]
    );
  }
});
